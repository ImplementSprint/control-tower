import type { AccessScope } from "@/lib/auth/access";
import { getScopedDeployments, getScopedWorkflowRuns } from "@/lib/dashboard/query-cache";
import { getTribeHealth } from "@/lib/dashboard/tribe-health";
import type { Deployment, WorkflowRun } from "@/lib/supabase/types";

async function getDeployments(scope: AccessScope) {
  try {
    const deployments = await getScopedDeployments(scope, { limit: 50 });

    return {
      deployments,
      error: null,
    };
  } catch (error) {
    return {
      deployments: [] as Deployment[],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while loading dashboard data.",
    };
  }
}

async function getWorkflowRuns(scope: AccessScope) {
  try {
    const runs = await getScopedWorkflowRuns(scope, { status: "all", limit: 50 });

    return {
      runs,
      error: null,
    };
  } catch (error) {
    return {
      runs: [] as WorkflowRun[],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while loading workflow runs.",
    };
  }
}

export async function getHomeDashboardData(scope: AccessScope) {
  const [
    { deployments, error },
    { runs: workflowRuns, error: workflowRunsError },
    { rows: tribeHealth, error: tribeHealthError },
  ] = await Promise.all([
    getDeployments(scope),
    getWorkflowRuns(scope),
    getTribeHealth(scope, 14),
  ]);

  return {
    deployments,
    error,
    workflowRuns,
    workflowRunsError,
    tribeHealth,
    tribeHealthError,
  };
}

export type HomeDashboardData = Awaited<ReturnType<typeof getHomeDashboardData>>;
