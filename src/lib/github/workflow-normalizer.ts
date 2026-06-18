import {
  buildRunIdTag,
  calculateDurationSeconds,
  getBranchEnvironment,
  resolveActionFromStatus,
  resolveDeploymentStatus,
} from "@/lib/control-tower/github-run-mapping";
import type { GitHubWorkflowJob, GitHubWorkflowRun } from "@/lib/github/github-client";
import type {
  DeploymentEnvironment,
  DeploymentStatus,
} from "@/lib/supabase/types";

export type GitHubWorkflowRunPayload = {
  action?: string;
  repository?: {
    name?: string;
    full_name?: string;
    default_branch?: string;
  };
  workflow?: {
    name?: string;
  };
  workflow_run?: GitHubWorkflowRun;
};

export type NormalizedWorkflowRun = {
  repository: string;
  runId: number;
  runAttempt: number;
  workflowName: string;
  branch: string;
  environment: DeploymentEnvironment;
  tribe: string;
  status: DeploymentStatus;
  githubStatus: string;
  githubConclusion: string;
  eventName: string;
  action: string;
  runUrl: string;
  commitSha: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  summary: string;
};

export type NormalizedWorkflowJob = {
  repository: string;
  runId: number;
  runAttempt: number;
  jobId: number;
  name: string;
  tribe: string;
  branch: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  githubStatus: string;
  githubConclusion: string;
  runUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
};

type NormalizeRunInput = {
  repository: string;
  run: GitHubWorkflowRun;
  tribe: string;
  branchFallback: string;
  workflowNameFallback: string;
  eventName: string;
  action: string;
};

function normalizeRunAttempt(runAttempt: number | undefined) {
  return typeof runAttempt === "number" && runAttempt > 0 ? runAttempt : 1;
}

function buildSummary(input: {
  tribe: string;
  workflowName: string;
  status: DeploymentStatus;
  runId: number;
  runAttempt: number;
  runUrl: string;
}) {
  const runIdTag = buildRunIdTag(input.runId, input.runAttempt);
  return `[tribe:${input.tribe}] ${input.workflowName} ${input.status} (${runIdTag})${
    input.runUrl ? ` ${input.runUrl}` : ""
  }`.slice(0, 500);
}

function normalizeWorkflowRun({
  repository,
  run,
  tribe,
  branchFallback,
  workflowNameFallback,
  eventName,
  action,
}: NormalizeRunInput): NormalizedWorkflowRun {
  if (!run.id) {
    throw new Error("GitHub workflow run is missing id.");
  }

  const branch = run.head_branch ?? branchFallback;
  const runStatus = (run.status ?? "").toLowerCase();
  const runConclusion = (run.conclusion ?? "").toLowerCase();
  const normalizedAction = action.toLowerCase();
  const status = resolveDeploymentStatus({
    action: normalizedAction,
    status: runStatus,
    conclusion: runConclusion,
  });
  const runAttempt = normalizeRunAttempt(run.run_attempt);
  const workflowName = run.name ?? workflowNameFallback;
  const runUrl = run.html_url ?? "";
  const durationSeconds = calculateDurationSeconds(run.run_started_at, run.updated_at);
  const completedAt = runStatus === "completed" ? run.updated_at ?? null : null;

  return {
    repository,
    runId: run.id,
    runAttempt,
    workflowName,
    branch,
    environment: getBranchEnvironment(branch),
    tribe,
    status,
    githubStatus: runStatus,
    githubConclusion: runConclusion,
    eventName,
    action: normalizedAction,
    runUrl,
    commitSha: run.head_sha ?? null,
    startedAt: run.run_started_at ?? null,
    completedAt,
    durationSeconds,
    summary: buildSummary({
      tribe,
      workflowName,
      status,
      runId: run.id,
      runAttempt,
      runUrl,
    }),
  };
}

export function normalizeSyncWorkflowRun(
  repository: string,
  run: GitHubWorkflowRun,
  tribe: string,
) {
  const runStatus = (run.status ?? "").toLowerCase();

  return normalizeWorkflowRun({
    repository,
    run,
    tribe,
    branchFallback: "test",
    workflowNameFallback: "Workflow",
    eventName: "workflow_run_sync",
    action: resolveActionFromStatus(runStatus),
  });
}

export function getWebhookWorkflowRunIdentity(payload: GitHubWorkflowRunPayload) {
  const workflowRun = payload.workflow_run;
  const repository = payload.repository;

  if (!workflowRun?.id || !repository) {
    return null;
  }

  return {
    workflowRun,
    repositoryName: repository.full_name ?? repository.name ?? "unknown/repository",
  };
}

export function normalizeWebhookWorkflowRun(
  payload: GitHubWorkflowRunPayload,
  tribe: string,
  eventName: string,
) {
  const identity = getWebhookWorkflowRunIdentity(payload);
  if (!identity) {
    throw new Error("Invalid workflow_run payload: missing workflow_run.id or repository.");
  }

  return normalizeWorkflowRun({
    repository: identity.repositoryName,
    run: identity.workflowRun,
    tribe,
    branchFallback: payload.repository?.default_branch ?? "test",
    workflowNameFallback: payload.workflow?.name ?? "Workflow",
    eventName,
    action: payload.action ?? "",
  });
}

export function buildSyncWorkflowRunPayload(
  repository: string,
  record: NormalizedWorkflowRun,
  run: GitHubWorkflowRun,
) {
  return {
    action: record.action,
    repository: {
      full_name: repository,
    },
    workflow_run: run,
  };
}

export function normalizeWorkflowJob(input: {
  repository: string;
  runId: number;
  runAttempt: number;
  tribe: string;
  branch: string;
  environment: DeploymentEnvironment;
  job: GitHubWorkflowJob;
}): NormalizedWorkflowJob | null {
  if (!input.job.id) {
    return null;
  }

  const jobStatus = (input.job.status ?? "").toLowerCase();
  const jobConclusion = (input.job.conclusion ?? "").toLowerCase();
  const status = resolveDeploymentStatus({
    status: jobStatus,
    conclusion: jobConclusion,
  });
  const completedAt = jobStatus === "completed" ? input.job.completed_at ?? null : null;

  return {
    repository: input.repository,
    runId: input.runId,
    runAttempt: input.runAttempt,
    jobId: input.job.id,
    name: input.job.name ?? `Job ${input.job.id}`,
    tribe: input.tribe,
    branch: input.branch,
    environment: input.environment,
    status,
    githubStatus: jobStatus,
    githubConclusion: jobConclusion,
    runUrl: input.job.html_url ?? null,
    startedAt: input.job.started_at ?? null,
    completedAt,
    durationSeconds: calculateDurationSeconds(input.job.started_at, input.job.completed_at),
  };
}
