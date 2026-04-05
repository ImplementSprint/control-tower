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

type TimelineRpcRow = {
  metric_date: string;
  total_runs: number | string | null;
  success_count: number | string | null;
  failed_count: number | string | null;
  running_count: number | string | null;
  cancelled_count: number | string | null;
  average_duration_seconds: number | string | null;
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

    const supabase = createSupabaseAdminClient();

    const scopedTribeFilter =
      scopedTribes === null
        ? null
        : scopedTribes.map((tribe) => tribe.toLowerCase());

    const { data, error } = await supabase.rpc("get_runs_timeline_metrics", {
      p_window_days: windowDays,
      p_tribes: scopedTribeFilter,
    });

    if (error) {
      return jsonError("Failed to fetch timeline data.", 500, { details: error.message });
    }

    const points: TimelinePoint[] = ((data ?? []) as TimelineRpcRow[]).map((row) => ({
      date: row.metric_date,
      total: Math.trunc(toNumber(row.total_runs)),
      success: Math.trunc(toNumber(row.success_count)),
      failed: Math.trunc(toNumber(row.failed_count)),
      running: Math.trunc(toNumber(row.running_count)),
      cancelled: Math.trunc(toNumber(row.cancelled_count)),
      avg_duration_seconds: Math.round(toNumber(row.average_duration_seconds)),
    }));

    return NextResponse.json({ window_days: windowDays, data: points });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
