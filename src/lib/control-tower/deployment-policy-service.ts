import {
  createAuditEvent,
  type AuditEventInput,
} from "@/lib/control-tower/governance";
import { upsertDeploymentFromRunIdentity } from "@/lib/control-tower/deployment-ingestion";
import type { NormalizedWorkflowRun } from "@/lib/github/workflow-normalizer";
import { logEvent } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DeploymentStatus } from "@/lib/supabase/types";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function isTerminalDeploymentStatus(status: DeploymentStatus) {
  return status === "success" || status === "failed" || status === "cancelled";
}

export async function upsertDeploymentForWorkflowRun(
  supabase: SupabaseAdminClient,
  record: NormalizedWorkflowRun,
) {
  return upsertDeploymentFromRunIdentity(supabase, {
    repository: record.repository,
    tribe: record.tribe,
    branch: record.branch,
    environment: record.environment,
    status: record.status,
    summary: record.summary,
    commitSha: record.commitSha,
    durationSeconds: record.durationSeconds,
    runId: record.runId,
    runAttempt: record.runAttempt,
  });
}

export async function writeWorkflowAuditEvent(
  supabase: SupabaseAdminClient,
  input: {
    warnEventName: string;
    event: AuditEventInput;
  },
) {
  try {
    await createAuditEvent(supabase, input.event);
  } catch (auditError) {
    logEvent("warn", input.warnEventName, {
      repository: input.event.repository ?? null,
      run_id: input.event.runId ?? null,
      run_attempt: input.event.runAttempt ?? null,
      details: auditError instanceof Error ? auditError.message : "Unknown error",
    });
  }
}
