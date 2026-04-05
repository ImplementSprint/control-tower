import type {
  DeploymentEnvironment,
  DeploymentStatus,
} from "@/lib/supabase/types";

type ResolveDeploymentStatusInput = {
  action?: string | null;
  status?: string | null;
  conclusion?: string | null;
};

const QUEUED_STATUSES = new Set(["queued", "requested", "waiting", "pending"]);

function normalizeState(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function getBranchEnvironment(branch: string): DeploymentEnvironment {
  if (branch === "main") {
    return "main";
  }

  if (branch === "uat") {
    return "uat";
  }

  return "test";
}

export function resolveDeploymentStatus({
  action,
  status,
  conclusion,
}: ResolveDeploymentStatusInput): DeploymentStatus {
  const normalizedAction = normalizeState(action);
  const normalizedStatus = normalizeState(status);
  const normalizedConclusion = normalizeState(conclusion);

  if (normalizedAction === "in_progress" || normalizedStatus === "in_progress") {
    return "running";
  }

  if (normalizedAction === "requested" || QUEUED_STATUSES.has(normalizedStatus)) {
    return "queued";
  }

  if (normalizedAction === "completed" || normalizedStatus === "completed") {
    if (normalizedConclusion === "success") {
      return "success";
    }

    if (normalizedConclusion === "cancelled" || normalizedConclusion === "skipped") {
      return "cancelled";
    }

    return "failed";
  }

  return "queued";
}

export function calculateDurationSeconds(
  startedAt: string | null | undefined,
  updatedAt: string | null | undefined,
) {
  if (!startedAt || !updatedAt) {
    return null;
  }

  const startTimestamp = Date.parse(startedAt);
  const endTimestamp = Date.parse(updatedAt);

  if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
    return null;
  }

  return Math.max(0, Math.round((endTimestamp - startTimestamp) / 1000));
}

export function resolveActionFromStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeState(status);

  if (normalizedStatus === "completed") {
    return "completed";
  }

  if (normalizedStatus === "in_progress") {
    return "in_progress";
  }

  return "requested";
}

export function buildRunIdTag(runId: number, runAttempt: number) {
  return `run_id:${runId}:attempt:${runAttempt}`;
}
