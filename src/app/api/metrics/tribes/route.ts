import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getScopedTribes } from "@/lib/auth/access";
import { requireAuthenticatedAccessScope } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import {
  getTrimmedSearchParam,
  parseBoundedIntegerParam,
} from "@/lib/api/params";

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
    const { accessScope, response } = await requireAuthenticatedAccessScope();

    if (!accessScope) {
      return response;
    }

    const searchParams = new URL(request.url).searchParams;
    const windowDays = parseBoundedIntegerParam({
      rawValue: searchParams.get("windowDays"),
      defaultValue: 14,
      min: 1,
      max: 90,
    });
    const requestedTribe = getTrimmedSearchParam(searchParams, "tribe");
    const scopedTribes = getScopedTribes(accessScope, requestedTribe);

    if (scopedTribes !== null && scopedTribes.length === 0) {
      return NextResponse.json({ window_days: windowDays, sampled_runs: 0, data: [] });
    }

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("workflow_runs")
      .select("tribe, status, duration_seconds, completed_at, created_at")
      .gte("created_at", since)
      .limit(5000);

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("Failed to fetch workflow runs for tribe metrics.", 500, {
        details: error.message,
      });
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
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unexpected error while computing tribe metrics.",
      500,
    );
  }
}
