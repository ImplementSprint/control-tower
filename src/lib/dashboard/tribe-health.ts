import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AccessScope } from "@/lib/auth/access";
import { unstable_cache } from "next/cache";

export type TribeHealthRow = {
  tribe: string;
  totalRuns: number;
  successCount: number;
  successRate: number;
  failedRuns: number;
  runningRuns: number;
  cancelledRuns: number;
  averageDurationSeconds: number;
  lastCompletedAt: string | null;
};

type TribeHealthMetricsRpcRow = {
  tribe: string | null;
  total_runs: number | string | null;
  success_count: number | string | null;
  failed_count: number | string | null;
  running_count: number | string | null;
  cancelled_count: number | string | null;
  success_rate: number | string | null;
  average_duration_seconds: number | string | null;
  last_completed_at: string | null;
};

type WorkflowRunHealthFallbackRow = {
  tribe: string | null;
  status: string | null;
  duration_seconds: number | string | null;
  completed_at: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeTribe(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "unmapped";
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "unmapped";
}

function isMissingTribeHealthRpc(error: { code?: string | null; message?: string | null }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    message.includes("could not find the function public.get_tribe_health_metrics")
  );
}

async function fetchTribeHealthMetricsFallback(
  windowDays: number,
  scopedTribes: string[] | null,
): Promise<TribeHealthRow[]> {
  const supabase = createSupabaseAdminClient();
  const days = Math.max(windowDays, 1);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const allowedTribes = scopedTribes
    ? new Set(scopedTribes.map((tribe) => normalizeTribe(tribe)))
    : null;

  const { data, error } = await supabase
    .from("workflow_runs")
    .select("tribe,status,duration_seconds,completed_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    throw new Error(error.message);
  }

  const aggregates = new Map<
    string,
    {
      tribe: string;
      totalRuns: number;
      successCount: number;
      failedRuns: number;
      runningRuns: number;
      cancelledRuns: number;
      durationTotal: number;
      durationCount: number;
      lastCompletedAt: string | null;
    }
  >();

  for (const run of ((data ?? []) as WorkflowRunHealthFallbackRow[])) {
    const tribe = normalizeTribe(run.tribe);
    if (allowedTribes && !allowedTribes.has(tribe)) {
      continue;
    }

    const entry =
      aggregates.get(tribe) ??
      {
        tribe,
        totalRuns: 0,
        successCount: 0,
        failedRuns: 0,
        runningRuns: 0,
        cancelledRuns: 0,
        durationTotal: 0,
        durationCount: 0,
        lastCompletedAt: null,
      };

    entry.totalRuns += 1;

    if (run.status === "success") entry.successCount += 1;
    if (run.status === "failed") entry.failedRuns += 1;
    if (run.status === "running") entry.runningRuns += 1;
    if (run.status === "cancelled") entry.cancelledRuns += 1;

    const durationSeconds = toNumber(run.duration_seconds);
    if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
      entry.durationTotal += durationSeconds;
      entry.durationCount += 1;
    }

    if (
      run.completed_at &&
      (!entry.lastCompletedAt || run.completed_at > entry.lastCompletedAt)
    ) {
      entry.lastCompletedAt = run.completed_at;
    }

    aggregates.set(tribe, entry);
  }

  return Array.from(aggregates.values())
    .map((entry) => ({
      tribe: entry.tribe,
      totalRuns: entry.totalRuns,
      successCount: entry.successCount,
      successRate:
        entry.totalRuns > 0
          ? Math.round((entry.successCount * 1000) / entry.totalRuns) / 10
          : 0,
      failedRuns: entry.failedRuns,
      runningRuns: entry.runningRuns,
      cancelledRuns: entry.cancelledRuns,
      averageDurationSeconds:
        entry.durationCount > 0
          ? Math.round(entry.durationTotal / entry.durationCount)
          : 0,
      lastCompletedAt: entry.lastCompletedAt,
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns);
}

const fetchTribeHealthMetrics = unstable_cache(
  async (windowDays: number, tribesKey: string) => {
    const supabase = createSupabaseAdminClient();
    const scopedTribes =
      tribesKey.length > 0
        ? tribesKey
            .split(",")
            .map((tribe) => tribe.trim())
            .filter((tribe) => tribe.length > 0)
        : null;

    const { data, error } = await supabase.rpc("get_tribe_health_metrics", {
      p_window_days: windowDays,
      p_tribes: scopedTribes,
    });

    if (error) {
      if (isMissingTribeHealthRpc(error)) {
        return fetchTribeHealthMetricsFallback(windowDays, scopedTribes);
      }
      throw new Error(error.message);
    }

    return ((data ?? []) as TribeHealthMetricsRpcRow[])
      .map((row) => ({
        tribe:
          typeof row.tribe === "string" && row.tribe.trim().length > 0
            ? row.tribe
            : "unmapped",
        totalRuns: Math.trunc(toNumber(row.total_runs)),
        successCount: Math.trunc(toNumber(row.success_count)),
        successRate: Math.round(toNumber(row.success_rate) * 10) / 10,
        failedRuns: Math.trunc(toNumber(row.failed_count)),
        runningRuns: Math.trunc(toNumber(row.running_count)),
        cancelledRuns: Math.trunc(toNumber(row.cancelled_count)),
        averageDurationSeconds: Math.round(toNumber(row.average_duration_seconds)),
        lastCompletedAt: row.last_completed_at,
      }))
      .sort((a, b) => b.totalRuns - a.totalRuns);
  },
  ["dashboard-tribe-health-metrics"],
  {
    revalidate: 120,
    tags: ["workflow-runs", "metrics"],
  },
);

export async function getTribeHealth(
  scope: AccessScope,
  windowDays = 14,
): Promise<{ rows: TribeHealthRow[]; error: string | null }> {
  try {
    if (!scope.isPlatformAdmin && scope.tribes.length === 0) {
      return { rows: [], error: null };
    }

    const tribesKey = scope.isPlatformAdmin
      ? ""
      : scope.tribes
          .map((tribe) => tribe.toLowerCase().trim())
          .filter((tribe) => tribe.length > 0)
          .sort()
          .join(",");

    const rows = await fetchTribeHealthMetrics(windowDays, tribesKey);

    return { rows, error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : "Unexpected error loading tribe health.",
    };
  }
}
