import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateDeploymentSchema } from "@/lib/supabase/types";
import { getAuthenticatedAccessScope } from "@/lib/auth/access";
import {
  createAuditEvent,
  evaluateDeploymentMutationPolicies,
  resolveTribeForRepository,
} from "@/lib/control-tower/governance";

const requestSchema = updateDeploymentSchema.extend({
  durationSeconds: z.preprocess((value) => {
    if (value === "" || value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value;
  }, z.number().int().min(0).max(172800).nullable().optional()),
  summary: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().max(500).nullable().optional()),
}).refine(
  (value) =>
    value.status || value.summary !== undefined || value.durationSeconds !== undefined,
  {
    message: "At least one field must be provided",
  },
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const accessScope = await getAuthenticatedAccessScope();

    if (!accessScope) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    if (!accessScope.isPlatformAdmin) {
      return NextResponse.json(
        { error: "Only platform admins can update deployment records." },
        { status: 403 },
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Deployment id is required." }, { status: 400 });
    }

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

    const updates: Record<string, string | number | null> = {};

    const supabase = createSupabaseAdminClient();
    const { data: existingDeployment, error: existingError } = await supabase
      .from("deployments")
      .select("id, repository, tribe, branch, environment, status, summary")
      .eq("id", id)
      .single();

    if (existingError || !existingDeployment) {
      return NextResponse.json(
        {
          error: "Unable to find deployment to update.",
          details: existingError?.message ?? "Missing deployment",
        },
        { status: 404 },
      );
    }

    if (parsed.data.status) {
      updates.status = parsed.data.status;
    }

    if (parsed.data.summary !== undefined) {
      updates.summary = parsed.data.summary;
    }

    if (parsed.data.durationSeconds !== undefined) {
      updates.duration_seconds = parsed.data.durationSeconds;
    }

    const tribe = await resolveTribeForRepository(supabase, existingDeployment.repository);
    const nextStatus = (updates.status as string | undefined) ?? existingDeployment.status;
    const nextSummary =
      updates.summary !== undefined
        ? (updates.summary as string | null)
        : (existingDeployment.summary as string | null);

    const violations = await evaluateDeploymentMutationPolicies(supabase, {
      repository: existingDeployment.repository,
      tribe,
      environment: existingDeployment.environment,
      status: nextStatus as typeof existingDeployment.status,
      summary: nextSummary,
    });

    if (violations.length > 0) {
      return NextResponse.json(
        {
          error: "Deployment update blocked by policy rules.",
          violations,
        },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("deployments")
      .update(updates)
      .eq("id", id)
      .select("id, repository, tribe, branch, environment, status, summary, commit_sha, duration_seconds, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: "Unable to update deployment.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    try {
      await createAuditEvent(supabase, {
        eventType: "deployment.updated",
        source: "api",
        actor: accessScope.email ?? accessScope.userId,
        actorType: "user",
        repository: data.repository,
        tribe,
        branch: data.branch,
        environment: data.environment,
        deploymentId: data.id,
        details: {
          previous_status: existingDeployment.status,
          next_status: data.status,
          previous_summary: existingDeployment.summary,
          next_summary: data.summary,
        },
      });
    } catch {
      // Do not fail successful mutation when audit logging has transient issues.
    }

    revalidatePath("/");
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while updating deployment.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
