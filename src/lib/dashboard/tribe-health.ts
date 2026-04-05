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
