import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AccessScope } from "@/lib/auth/access";

export type TribeHealthRow = {
  tribe: string;
  totalRuns: number;
  successRate: number;
  failedRuns: number;
  runningRuns: number;
  averageDurationSeconds: number;
};

export async function getTribeHealth(
  scope: AccessScope,
  windowDays = 14,
): Promise<{ rows: TribeHealthRow[]; error: string | null }> {
  try {
    if (!scope.isPlatformAdmin && scope.tribes.length === 0) {
      return { rows: [], error: null };
    }

    const supabase = createSupabaseAdminClient();
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("workflow_runs")
      .select("tribe, status, duration_seconds, created_at")
      .gte("created_at", since)
      .limit(5000);

    if (!scope.isPlatformAdmin) {
      query = query.in("tribe", scope.tribes);
    }

    const { data, error } = await query;

    if (error) {
      return { rows: [], error: "Unable to load tribe health metrics from workflow runs." };
    }

    const byTribe = new Map<
      string,
      { total: number; success: number; failed: number; running: number; durationSum: number; durationCount: number }
    >();

    for (const run of data ?? []) {
      const tribe =
        typeof run.tribe === "string" && run.tribe.trim().length > 0
          ? run.tribe
          : "unmapped";

      const current = byTribe.get(tribe) ?? {
        total: 0, success: 0, failed: 0, running: 0, durationSum: 0, durationCount: 0,
      };

      current.total += 1;
      if (run.status === "success") current.success += 1;
      else if (run.status === "failed") current.failed += 1;
      else if (run.status === "running") current.running += 1;

      if (typeof run.duration_seconds === "number") {
        current.durationSum += run.duration_seconds;
        current.durationCount += 1;
      }

      byTribe.set(tribe, current);
    }

    const rows = Array.from(byTribe.entries())
      .map(([tribe, value]) => ({
        tribe,
        totalRuns: value.total,
        successRate: value.total > 0 ? Math.round((value.success / value.total) * 1000) / 10 : 0,
        failedRuns: value.failed,
        runningRuns: value.running,
        averageDurationSeconds:
          value.durationCount > 0 ? Math.round(value.durationSum / value.durationCount) : 0,
      }))
      .sort((a, b) => b.totalRuns - a.totalRuns);

    return { rows, error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : "Unexpected error loading tribe health.",
    };
  }
}
