import { describe, expect, it } from "vitest";

import {
  buildSyncWorkflowRunPayload,
  getWebhookWorkflowRunIdentity,
  normalizeSyncWorkflowRun,
  normalizeWebhookWorkflowRun,
  normalizeWorkflowJob,
} from "./workflow-normalizer";

describe("workflow normalizer", () => {
  it("normalizes a sync workflow run into the deployment shape", () => {
    const run = {
      id: 101,
      run_attempt: 2,
      name: "Deploy",
      status: "completed",
      conclusion: "success",
      html_url: "https://github.example/run/101",
      head_branch: "uat",
      head_sha: "abc1234",
      run_started_at: "2026-06-18T10:00:00Z",
      updated_at: "2026-06-18T10:05:30Z",
    };

    const record = normalizeSyncWorkflowRun("org/service", run, "platform");

    expect(record).toMatchObject({
      repository: "org/service",
      runId: 101,
      runAttempt: 2,
      workflowName: "Deploy",
      branch: "uat",
      environment: "uat",
      tribe: "platform",
      status: "success",
      githubStatus: "completed",
      githubConclusion: "success",
      eventName: "workflow_run_sync",
      action: "completed",
      runUrl: "https://github.example/run/101",
      commitSha: "abc1234",
      durationSeconds: 330,
    });
    expect(record.summary).toContain("[tribe:platform] Deploy success");
  });

  it("normalizes webhook workflow runs with repository defaults", () => {
    const payload = {
      action: "requested",
      repository: {
        full_name: "org/service",
        default_branch: "main",
      },
      workflow: {
        name: "Release",
      },
      workflow_run: {
        id: 202,
        status: "queued",
      },
    };

    expect(getWebhookWorkflowRunIdentity(payload)).toEqual({
      workflowRun: payload.workflow_run,
      repositoryName: "org/service",
    });
    expect(normalizeWebhookWorkflowRun(payload, "platform", "workflow_run")).toMatchObject({
      repository: "org/service",
      runId: 202,
      runAttempt: 1,
      workflowName: "Release",
      branch: "main",
      environment: "main",
      status: "queued",
      action: "requested",
    });
  });

  it("returns null for workflow jobs without an id", () => {
    expect(
      normalizeWorkflowJob({
        repository: "org/service",
        runId: 101,
        runAttempt: 1,
        tribe: "platform",
        branch: "test",
        environment: "test",
        job: { name: "missing id" },
      }),
    ).toBeNull();
  });

  it("normalizes completed workflow jobs", () => {
    expect(
      normalizeWorkflowJob({
        repository: "org/service",
        runId: 101,
        runAttempt: 1,
        tribe: "platform",
        branch: "test",
        environment: "test",
        job: {
          id: 333,
          status: "completed",
          conclusion: "failure",
          started_at: "2026-06-18T10:00:00Z",
          completed_at: "2026-06-18T10:01:00Z",
        },
      }),
    ).toMatchObject({
      jobId: 333,
      name: "Job 333",
      status: "failed",
      completedAt: "2026-06-18T10:01:00Z",
      durationSeconds: 60,
    });
  });

  it("builds the sync raw event payload from the normalized action", () => {
    const run = { id: 404, status: "in_progress" };
    const record = normalizeSyncWorkflowRun("org/service", run, "platform");

    expect(buildSyncWorkflowRunPayload("org/service", record, run)).toEqual({
      action: "in_progress",
      repository: { full_name: "org/service" },
      workflow_run: run,
    });
  });
});
