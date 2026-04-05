import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateDeploymentSchema } from "@/lib/supabase/types";
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
    const { accessScope, response } = await requireAuthenticatedAccessScope();

    if (!accessScope) {
      return response;
    }

    const platformAdminError = requirePlatformAdmin(
      accessScope,
      "Only platform admins can update deployment records.",
    );

    if (platformAdminError) {
      return platformAdminError;
    }

    const { id } = await params;

    if (!id) {
      return jsonError("Deployment id is required.", 400);
    }

    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError("Invalid request body.", 400, {
        issues: parsed.error.flatten(),
      });
    }

    const updates: Record<string, string | number | null> = {};

    const supabase = createSupabaseAdminClient();
    const { data: existingDeployment, error: existingError } = await supabase
      .from("deployments")
      .select("id, repository, tribe, branch, environment, status, summary")
      .eq("id", id)
      .single();

    if (existingError || !existingDeployment) {
      return jsonError("Unable to find deployment to update.", 404, {
        details: existingError?.message ?? "Missing deployment",
      });
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
      return jsonError("Deployment update blocked by policy rules.", 409, {
        violations,
      });
    }

    const { data, error } = await supabase
      .from("deployments")
      .update(updates)
      .eq("id", id)
      .select("id, repository, tribe, branch, environment, status, summary, commit_sha, run_id, run_attempt, duration_seconds, created_at, updated_at")
      .single();

    if (error) {
      return jsonError("Unable to update deployment.", 500, {
        details: error.message,
      });
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
    } catch (auditError) {
      logEvent("warn", "deployment.update.audit_write_failed", {
        repository: data.repository,
        deployment_id: data.id,
        details: auditError instanceof Error ? auditError.message : "Unknown error",
      });
    }

    revalidatePath("/");
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while updating deployment.";

    return jsonError(message, 500);
  }
}
