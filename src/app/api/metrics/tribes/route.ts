import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type TribeMetricRow = {
  tribe: string;
  total_runs: number;
  success_count: number;
  failed_count: number;
  running_count: number;
  cancelled_count: number;
  success_rate: number;
  average_duration_seconds: number;
  last_completed_at: string | null;
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const windowDaysRaw = Number(searchParams.get("windowDays") ?? "14");
    const windowDays = Number.isFinite(windowDaysRaw)
      ? Math.min(Math.max(Math.trunc(windowDaysRaw), 1), 90)
      : 14;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("workflow_runs")
      .select("tribe, status, duration_seconds, completed_at, created_at")
      .gte("created_at", since)
      .limit(5000);

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch workflow runs for tribe metrics.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    const rows = data ?? [];
    const byTribe = new Map<
      string,
      {
        total: number;
        success: number;
        failed: number;
        running: number;
        cancelled: number;
        durationSum: number;
        durationCount: number;
        lastCompletedAt: string | null;
      }
    >();

    for (const row of rows) {
      const tribe =
        typeof row.tribe === "string" && row.tribe.trim().length > 0
          ? row.tribe.trim()
          : "unmapped";

      const current = byTribe.get(tribe) ?? {
        total: 0,
        success: 0,
        failed: 0,
        running: 0,
        cancelled: 0,
        durationSum: 0,
        durationCount: 0,
        lastCompletedAt: null,
      };

      current.total += 1;

      const status = String(row.status ?? "");
      if (status === "success") {
        current.success += 1;
      } else if (status === "failed") {
        current.failed += 1;
      } else if (status === "running") {
        current.running += 1;
      } else if (status === "cancelled") {
        current.cancelled += 1;
      }

      if (typeof row.duration_seconds === "number") {
        current.durationSum += row.duration_seconds;
        current.durationCount += 1;
      }

      const completedAt =
        typeof row.completed_at === "string" && row.completed_at.length > 0
          ? row.completed_at
          : null;

      if (
        completedAt &&
        (!current.lastCompletedAt || Date.parse(completedAt) > Date.parse(current.lastCompletedAt))
      ) {
        current.lastCompletedAt = completedAt;
      }

      byTribe.set(tribe, current);
    }

    const metrics: TribeMetricRow[] = Array.from(byTribe.entries())
      .map(([tribe, value]) => {
        const successRate = value.total > 0 ? (value.success / value.total) * 100 : 0;
        const avgDuration =
          value.durationCount > 0
            ? Math.round(value.durationSum / value.durationCount)
            : 0;

        return {
          tribe,
          total_runs: value.total,
          success_count: value.success,
          failed_count: value.failed,
          running_count: value.running,
          cancelled_count: value.cancelled,
          success_rate: Math.round(successRate * 10) / 10,
          average_duration_seconds: avgDuration,
          last_completed_at: value.lastCompletedAt,
        };
      })
      .sort((a, b) => b.total_runs - a.total_runs);

    return NextResponse.json({
      window_days: windowDays,
      sampled_runs: rows.length,
      data: metrics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while computing tribe metrics.",
      },
      { status: 500 },
    );
  }
}
