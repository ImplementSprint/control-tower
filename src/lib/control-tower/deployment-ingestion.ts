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

  const { data: existingRow, error: lookupError } = await supabase
    .from("deployments")
    .select("id")
    .eq("repository", input.repository)
    .eq("run_id", input.runId)
    .eq("run_attempt", input.runAttempt)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(
      `Failed to lookup deployment by run identity (${input.repository}/${input.runId}/${input.runAttempt}): ${lookupError.message}`,
    );
  }

  if (existingRow?.id) {
    const { error: updateError } = await supabase
      .from("deployments")
      .update(payload)
      .eq("id", existingRow.id);

    if (updateError) {
      throw new Error(
        `Failed to update deployment by run identity (${input.repository}/${input.runId}/${input.runAttempt}): ${updateError.message}`,
      );
    }

    return {
      deploymentId: existingRow.id,
      wasCreated: false,
    };
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from("deployments")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) {
    throw new Error(
      `Failed to insert deployment by run identity (${input.repository}/${input.runId}/${input.runAttempt}): ${insertError.message}`,
    );
  }

  return {
    deploymentId: insertedRow.id,
    wasCreated: true,
  };
}
