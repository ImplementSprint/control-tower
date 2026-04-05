import { unstable_cache } from "next/cache";
import type { AccessScope } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Deployment,
  DeploymentStatus,
  WorkflowRun,
} from "@/lib/supabase/types";

type GetScopedDeploymentsOptions = {
  limit?: number;
};

type GetScopedWorkflowRunsOptions = {
  status?: DeploymentStatus | "all";
  limit?: number;
};

const ALL_TRIBES_KEY = "__all_tribes__";

function getTribeScopeKey(scope: AccessScope) {
  if (scope.isPlatformAdmin) {
    return ALL_TRIBES_KEY;
  }

  return scope.tribes
    .map((tribe) => tribe.toLowerCase().trim())
    .filter((tribe) => tribe.length > 0)
    .sort()
    .join(",");
}

function parseTribeScopeKey(tribeScopeKey: string) {
  if (tribeScopeKey === ALL_TRIBES_KEY) {
    return null;
  }

  const tribes = tribeScopeKey
    .split(",")
    .map((tribe) => tribe.trim())
    .filter((tribe) => tribe.length > 0);

  return tribes.length > 0 ? tribes : [];
}

const fetchScopedDeployments = unstable_cache(
  async (tribeScopeKey: string, limit: number) => {
    const supabase = createSupabaseAdminClient();
    const scopedTribes = parseTribeScopeKey(tribeScopeKey);

    let query = supabase
      .from("deployments")
      .select(
        "id, repository, tribe, branch, environment, status, summary, commit_sha, run_id, run_attempt, duration_seconds, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as Deployment[];
  },
  ["dashboard-scoped-deployments"],
  {
    revalidate: 120,
    tags: ["deployments"],
  },
);

const fetchScopedWorkflowRuns = unstable_cache(
  async (tribeScopeKey: string, statusScope: string, limit: number) => {
    const supabase = createSupabaseAdminClient();
    const scopedTribes = parseTribeScopeKey(tribeScopeKey);

    let query = supabase
      .from("workflow_runs")
      .select(
        "id, repository, run_id, run_attempt, workflow_name, branch, environment, tribe, status, github_conclusion, run_url, completed_at, duration_seconds, created_at",
      )
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    if (statusScope !== "all") {
      query = query.eq("status", statusScope);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as WorkflowRun[];
  },
  ["dashboard-scoped-workflow-runs"],
  {
    revalidate: 120,
    tags: ["workflow-runs"],
  },
);

export async function getScopedDeployments(
  scope: AccessScope,
  options: GetScopedDeploymentsOptions = {},
) {
  if (!scope.isPlatformAdmin && scope.tribes.length === 0) {
    return [] as Deployment[];
  }

  const limit = Number.isFinite(options.limit)
    ? Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 100)
    : 50;

  return fetchScopedDeployments(getTribeScopeKey(scope), limit);
}

export async function getScopedWorkflowRuns(
  scope: AccessScope,
  options: GetScopedWorkflowRunsOptions = {},
) {
  if (!scope.isPlatformAdmin && scope.tribes.length === 0) {
    return [] as WorkflowRun[];
  }

  const limit = Number.isFinite(options.limit)
    ? Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200)
    : 50;

  const status = options.status ?? "all";

  return fetchScopedWorkflowRuns(getTribeScopeKey(scope), status, limit);
}
