import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createDeploymentSchema } from "@/lib/supabase/types";
import {
  createAuditEvent,
  evaluateDeploymentMutationPolicies,
  resolveTribeForRepository,
} from "@/lib/control-tower/governance";

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
    const searchParams = new URL(request.url).searchParams;
    const limitParam = Number(searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 100)
      : 20;

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("deployments")
      .select("id, repository, branch, environment, status, summary, commit_sha, duration_seconds, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        {
          error:
            "Failed to fetch deployments from Supabase. Ensure the table exists and env vars are configured.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while loading deployments.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
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
      return NextResponse.json(
        {
          error: "Deployment blocked by policy rules.",
          violations,
        },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("deployments")
      .insert({
        repository: parsed.data.repository,
        branch: parsed.data.branch,
        environment: parsed.data.environment,
        status: parsed.data.status,
        summary: parsed.data.summary ?? null,
        commit_sha: parsed.data.commitSha ?? null,
        duration_seconds: parsed.data.durationSeconds ?? null,
      })
      .select("id, repository, branch, environment, status, summary, commit_sha, duration_seconds, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error:
            "Unable to create deployment. Verify Supabase schema and service role key.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    try {
      await createAuditEvent(supabase, {
        eventType: "deployment.created",
        source: "api",
        actor: request.headers.get("x-actor") ?? "anonymous",
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
    } catch {
      // Do not fail successful mutation when audit logging has transient issues.
    }

    revalidatePath("/");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while creating deployment.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
