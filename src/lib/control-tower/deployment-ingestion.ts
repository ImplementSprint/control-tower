import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  DeploymentEnvironment,
  DeploymentStatus,
} from "@/lib/supabase/types";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type UpsertDeploymentFromRunInput = {
  repository: string;
  tribe: string;
  branch: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  summary: string;
  commitSha: string | null;
  durationSeconds: number | null;
  runId: number;
  runAttempt: number;
};

export async function upsertDeploymentFromRunIdentity(
  supabase: SupabaseAdminClient,
  input: UpsertDeploymentFromRunInput,
) {
  const payload = {
    repository: input.repository,
    tribe: input.tribe,
    branch: input.branch,
    environment: input.environment,
    status: input.status,
    summary: input.summary,
    commit_sha: input.commitSha,
    duration_seconds: input.durationSeconds,
    run_id: input.runId,
    run_attempt: input.runAttempt,
  };

  const { data: upsertedRow, error: upsertError } = await supabase
    .from("deployments")
    .upsert(payload, { onConflict: "repository,run_id,run_attempt" })
    .select("id")
    .single();

  if (upsertError) {
    throw new Error(
      `Failed to upsert deployment by run identity (${input.repository}/${input.runId}/${input.runAttempt}): ${upsertError.message}`,
    );
  }

  return {
    deploymentId: upsertedRow.id,
    wasCreated: true,
  };
}
