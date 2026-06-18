import { describe, expect, it, vi } from "vitest";

import { upsertRawWorkflowEvent, upsertWorkflowJobs, upsertWorkflowRunRecord } from "./workflow-run-store";
import type {
  NormalizedWorkflowJob,
  NormalizedWorkflowRun,
} from "./workflow-normalizer";

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ upsert }));

  return { supabase: { from }, from, upsert };
}

const workflowRun: NormalizedWorkflowRun = {
  repository: "org/service",
  runId: 101,
  runAttempt: 1,
  workflowName: "Deploy",
  branch: "test",
  environment: "test",
  tribe: "platform",
  status: "success",
  githubStatus: "completed",
  githubConclusion: "success",
  eventName: "workflow_run",
  action: "completed",
  runUrl: "https://github.example/run/101",
  commitSha: "abc1234",
  startedAt: "2026-06-18T10:00:00Z",
  completedAt: "2026-06-18T10:01:00Z",
  durationSeconds: 60,
  summary: "[tribe:platform] Deploy success",
};

const workflowJob: NormalizedWorkflowJob = {
  repository: "org/service",
  runId: 101,
  runAttempt: 1,
  jobId: 202,
  name: "build",
  tribe: "platform",
  branch: "test",
  environment: "test",
  status: "success",
  githubStatus: "completed",
  githubConclusion: "success",
  runUrl: "https://github.example/job/202",
  startedAt: "2026-06-18T10:00:00Z",
  completedAt: "2026-06-18T10:01:00Z",
  durationSeconds: 60,
};

describe("workflow run store", () => {
  it("upserts raw workflow events", async () => {
    const { supabase, from, upsert } = makeSupabase();

    await upsertRawWorkflowEvent(supabase as never, {
      deliveryId: "delivery-1",
      eventName: "workflow_run",
      action: "completed",
      repository: "org/service",
      payload: { ok: true },
      signatureValid: true,
    });

    expect(from).toHaveBeenCalledWith("github_webhook_events");
    expect(upsert).toHaveBeenCalledWith(
      {
        delivery_id: "delivery-1",
        event_name: "workflow_run",
        action: "completed",
        repository: "org/service",
        payload: { ok: true },
        signature_valid: true,
      },
      { onConflict: "delivery_id" },
    );
  });

  it("upserts normalized workflow runs", async () => {
    const { supabase, from, upsert } = makeSupabase();

    await upsertWorkflowRunRecord(supabase as never, workflowRun);

    expect(from).toHaveBeenCalledWith("workflow_runs");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: "org/service",
        run_id: 101,
        run_attempt: 1,
        workflow_name: "Deploy",
        status: "success",
      }),
      { onConflict: "repository,run_id,run_attempt" },
    );
  });

  it("upserts normalized workflow jobs", async () => {
    const { supabase, from, upsert } = makeSupabase();

    await expect(upsertWorkflowJobs(supabase as never, [workflowJob])).resolves.toBe(1);

    expect(from).toHaveBeenCalledWith("workflow_jobs");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: "org/service",
        run_id: 101,
        job_id: 202,
        name: "build",
      }),
      { onConflict: "repository,job_id" },
    );
  });
});
