import type {
  Deployment,
  DeploymentStatus,
  WorkflowRun,
} from "@/lib/supabase/types";

export type FocusFilter =
  | "all"
  | "new"
  | "high-priority"
  | "at-risk"
  | "closing-soon";

export function filterDeployments(deployments: Deployment[], focus: FocusFilter) {
  if (focus === "new") {
    return deployments.filter(
      (item) => item.status === "queued" || item.status === "running",
    );
  }

  if (focus === "high-priority") {
    return deployments.filter((item) => item.status === "failed");
  }

  if (focus === "at-risk") {
    return deployments.filter(
      (item) => item.status === "failed" || item.status === "cancelled",
    );
  }

  if (focus === "closing-soon") {
    return deployments.filter((item) => item.status === "success");
  }

  return deployments;
}

export function filterWorkflowRuns(runs: WorkflowRun[], focus: FocusFilter) {
  if (focus === "new") {
    return runs.filter((item) => item.status === "queued" || item.status === "running");
  }

  if (focus === "high-priority") {
    return runs.filter((item) => item.status === "failed");
  }

  if (focus === "at-risk") {
    return runs.filter(
      (item) => item.status === "failed" || item.status === "cancelled",
    );
  }

  if (focus === "closing-soon") {
    return runs.filter((item) => item.status === "success");
  }

  return runs;
}

export function getDeploymentMetrics(deployments: Deployment[]) {
  const total = deployments.length;
  const success = deployments.filter((item) => item.status === "success").length;
  const failed = deployments.filter((item) => item.status === "failed").length;
  const running = deployments.filter((item) => item.status === "running").length;
  const successRate = total > 0 ? (success / total) * 100 : 0;

  const withDurations = deployments.filter(
    (item) => typeof item.duration_seconds === "number",
  );
  const averageDuration =
    withDurations.reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0) /
    Math.max(withDurations.length, 1);

  return {
    total,
    success,
    failed,
    running,
    successRate: Math.round(successRate * 10) / 10,
    averageDuration: Math.round(averageDuration),
  };
}

export function getReliabilityBand(successRate: number) {
  if (successRate >= 95) {
    return "Elite";
  }

  if (successRate >= 85) {
    return "Strong";
  }

  if (successRate >= 70) {
    return "Improving";
  }

  return "At Risk";
}

export function getRiskTone(status: DeploymentStatus) {
  if (status === "failed") {
    return {
      label: "High",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (status === "running" || status === "cancelled") {
    return {
      label: "Medium",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Low",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

export function getDeploymentNextAction(deployment: Deployment) {
  if (deployment.summary && deployment.summary.trim().length > 0) {
    const summary = deployment.summary.trim();
    return summary.length > 44 ? `${summary.slice(0, 44)}...` : summary;
  }

  if (deployment.status === "failed") {
    return "Review failed jobs";
  }

  if (deployment.status === "running") {
    return "Monitor active checks";
  }

  if (deployment.status === "queued") {
    return "Await runner slot";
  }

  if (deployment.status === "cancelled") {
    return "Investigate cancellation";
  }

  return "Ready for promotion";
}

export function getRunNextAction(run: WorkflowRun) {
  if (run.status === "failed") {
    return "Open failed jobs";
  }

  if (run.status === "running") {
    return "Track active jobs";
  }

  if (run.status === "queued") {
    return "Await runner allocation";
  }

  if (run.github_conclusion === "cancelled") {
    return "Investigate cancellation";
  }

  return "Review run output";
}
