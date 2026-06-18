import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  NormalizedWorkflowJob,
  NormalizedWorkflowRun,
} from "@/lib/github/workflow-normalizer";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function upsertRawWorkflowEvent(
  supabase: SupabaseAdminClient,
  input: {
    deliveryId: string;
    eventName: string;
    action: string | null;
    repository: string;
    payload: unknown;
    signatureValid: boolean;
  },
) {
  const { error } = await supabase.from("github_webhook_events").upsert(
    {
      delivery_id: input.deliveryId,
      event_name: input.eventName,
      action: input.action,
      repository: input.repository,
      payload: input.payload,
      signature_valid: input.signatureValid,
    },
    { onConflict: "delivery_id" },
  );

  if (error) {
    throw new Error(`Failed to store raw workflow event: ${error.message}`);
  }
}

export async function upsertWorkflowRunRecord(
  supabase: SupabaseAdminClient,
  record: NormalizedWorkflowRun,
) {
  const { error } = await supabase.from("workflow_runs").upsert(
    {
      repository: record.repository,
      run_id: record.runId,
      run_attempt: record.runAttempt,
      workflow_name: record.workflowName,
      branch: record.branch,
      environment: record.environment,
      tribe: record.tribe,
      status: record.status,
      github_status: record.githubStatus || null,
      github_conclusion: record.githubConclusion || null,
      event_name: record.eventName,
      action: record.action || null,
      run_url: record.runUrl || null,
      commit_sha: record.commitSha,
      started_at: record.startedAt,
      completed_at: record.completedAt,
      duration_seconds: record.durationSeconds,
    },
    { onConflict: "repository,run_id,run_attempt" },
  );

  if (error) {
    throw new Error(`Failed to upsert workflow run: ${error.message}`);
  }
}

export async function upsertWorkflowJobs(
  supabase: SupabaseAdminClient,
  jobs: NormalizedWorkflowJob[],
) {
  let upsertedCount = 0;

  for (const job of jobs) {
    const { error } = await supabase.from("workflow_jobs").upsert(
      {
        repository: job.repository,
        run_id: job.runId,
        run_attempt: job.runAttempt,
        job_id: job.jobId,
        name: job.name,
        tribe: job.tribe,
        branch: job.branch,
        environment: job.environment,
        status: job.status,
        github_status: job.githubStatus || null,
        github_conclusion: job.githubConclusion || null,
        run_url: job.runUrl,
        started_at: job.startedAt,
        completed_at: job.completedAt,
        duration_seconds: job.durationSeconds,
      },
      { onConflict: "repository,job_id" },
    );

    if (error) {
      throw new Error(`Failed to upsert workflow job ${job.jobId}: ${error.message}`);
    }

    upsertedCount += 1;
  }

  return upsertedCount;
}
