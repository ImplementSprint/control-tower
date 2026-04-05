import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getScopedTribes } from "@/lib/auth/access";
import { requireAuthenticatedAccessScope } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import { parseBoundedIntegerParam, getTrimmedSearchParam } from "@/lib/api/params";

type TimelinePoint = {
  date: string;
  total: number;
  success: number;
  failed: number;
  running: number;
  cancelled: number;
  avg_duration_seconds: number;
};

export async function GET(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;

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
      return NextResponse.json({ window_days: windowDays, data: [] });
    }

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("workflow_runs")
      .select("status, duration_seconds, created_at")
      .gte("created_at", since)
      .limit(5000);

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("Failed to fetch timeline data.", 500, { details: error.message });
    }

    const byDay = new Map<
      string,
      { total: number; success: number; failed: number; running: number; cancelled: number; durationSum: number; durationCount: number }
    >();

    for (const row of data ?? []) {
      const date = (row.created_at as string).slice(0, 10);
      const current = byDay.get(date) ?? { total: 0, success: 0, failed: 0, running: 0, cancelled: 0, durationSum: 0, durationCount: 0 };

      current.total += 1;
      const status = String(row.status ?? "");
      if (status === "success") current.success += 1;
      else if (status === "failed") current.failed += 1;
      else if (status === "running") current.running += 1;
      else if (status === "cancelled") current.cancelled += 1;

      if (typeof row.duration_seconds === "number") {
        current.durationSum += row.duration_seconds;
        current.durationCount += 1;
      }

      byDay.set(date, current);
    }

    // Fill in missing days with zeros
    const points: TimelinePoint[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const value = byDay.get(date) ?? { total: 0, success: 0, failed: 0, running: 0, cancelled: 0, durationSum: 0, durationCount: 0 };

      points.push({
        date,
        total: value.total,
        success: value.success,
        failed: value.failed,
        running: value.running,
        cancelled: value.cancelled,
        avg_duration_seconds: value.durationCount > 0 ? Math.round(value.durationSum / value.durationCount) : 0,
      });
    }

    return NextResponse.json({ window_days: windowDays, data: points });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
