import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createDeploymentSchema } from "@/lib/supabase/types";
import { getScopedTribes } from "@/lib/auth/access";
import {
  createAuditEvent,
  evaluateDeploymentMutationPolicies,
  resolveTribeForRepository,
} from "@/lib/control-tower/governance";
import { logEvent } from "@/lib/observability";
import {
  requireAuthenticatedAccessScope,
  requirePlatformAdmin,
} from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import {
  getTrimmedSearchParam,
  parseBoundedIntegerParam,
} from "@/lib/api/params";

const requestSchema = createDeploymentSchema.extend({
  durationSeconds: z.preprocess((value) => {
    if (value === "" || value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value;
  }, z.number().int().min(0).max(172800).optional()),
  summary: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(500).optional()),
  commitSha: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().regex(/^[0-9a-f]{7,40}$/i).optional()),
});

export async function GET(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();

    if (!accessScope) {
      return response;
    }

    const searchParams = new URL(request.url).searchParams;
    const limit = parseBoundedIntegerParam({
      rawValue: searchParams.get("limit"),
      defaultValue: 20,
      min: 1,
      max: 100,
    });
    const requestedTribe = getTrimmedSearchParam(searchParams, "tribe");
    const scopedTribes = getScopedTribes(accessScope, requestedTribe);

    if (scopedTribes !== null && scopedTribes.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("deployments")
      .select("id, repository, tribe, branch, environment, status, summary, commit_sha, run_id, run_attempt, duration_seconds, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError(
        "Failed to fetch deployments from Supabase. Ensure the table exists and env vars are configured.",
        500,
        { details: error.message },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while loading deployments.";

    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();

    if (!accessScope) {
      return response;
    }

    const platformAdminError = requirePlatformAdmin(
      accessScope,
      "Only platform admins can create deployment records.",
    );

    if (platformAdminError) {
      return platformAdminError;
    }

    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError("Invalid request body.", 400, {
        issues: parsed.error.flatten(),
      });
    }

    const supabase = createSupabaseAdminClient();
    const tribe = await resolveTribeForRepository(supabase, parsed.data.repository);
    const violations = await evaluateDeploymentMutationPolicies(supabase, {
      repository: parsed.data.repository,
      tribe,
      environment: parsed.data.environment,
      status: parsed.data.status,
      summary: parsed.data.summary ?? null,
    });

    if (violations.length > 0) {
      return jsonError("Deployment blocked by policy rules.", 409, {
        violations,
      });
    }

    const { data, error } = await supabase
      .from("deployments")
      .insert({
        repository: parsed.data.repository,
        tribe,
        branch: parsed.data.branch,
        environment: parsed.data.environment,
        status: parsed.data.status,
        summary: parsed.data.summary ?? null,
        commit_sha: parsed.data.commitSha ?? null,
        duration_seconds: parsed.data.durationSeconds ?? null,
        created_by: accessScope.userId,
      })
      .select("id, repository, tribe, branch, environment, status, summary, commit_sha, run_id, run_attempt, duration_seconds, created_at, updated_at")
      .single();

    if (error) {
      return jsonError(
        "Unable to create deployment. Verify Supabase schema and service role key.",
        500,
        { details: error.message },
      );
    }

    try {
      await createAuditEvent(supabase, {
        eventType: "deployment.created",
        source: "api",
        actor: accessScope.email ?? accessScope.userId,
        actorType: "user",
        repository: data.repository,
        tribe,
        branch: data.branch,
        environment: data.environment,
        deploymentId: data.id,
        details: {
          status: data.status,
        },
      });
    } catch (auditError) {
      logEvent("warn", "deployment.create.audit_write_failed", {
        repository: data.repository,
        deployment_id: data.id,
        details: auditError instanceof Error ? auditError.message : "Unknown error",
      });
    }

    revalidatePath("/");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while creating deployment.";

    return jsonError(message, 500);
  }
}
