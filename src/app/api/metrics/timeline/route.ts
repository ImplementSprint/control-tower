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

type WorkflowRunTimelineFallbackRow = {
  created_at: string | null;
  tribe: string | null;
  status: string | null;
  duration_seconds: number | string | null;
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

function isMissingTimelineRpc(error: { code?: string | null; message?: string | null }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    message.includes("could not find the function public.get_runs_timeline_metrics")
  );
}

function buildTimelineBuckets(windowDays: number) {
  const days = Math.max(windowDays, 1);
  const end = new Date();
  const endUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );

  const buckets: TimelinePoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(endUtc - offset * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    buckets.push({
      date: bucketDate,
      total: 0,
      success: 0,
      failed: 0,
      running: 0,
      cancelled: 0,
      avg_duration_seconds: 0,
    });
  }

  return buckets;
}

async function getTimelineFallback(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  windowDays: number,
  scopedTribes: string[] | null,
): Promise<TimelinePoint[]> {
  const buckets = buildTimelineBuckets(windowDays);
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  const durationStats = new Map<string, { total: number; count: number }>();
  const days = Math.max(windowDays, 1);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const allowedTribes = scopedTribes
    ? new Set(scopedTribes.map((tribe) => normalizeTribe(tribe)))
    : null;

  const { data, error } = await supabase
    .from("workflow_runs")
    .select("created_at,tribe,status,duration_seconds")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(error.message);
  }

  for (const run of ((data ?? []) as WorkflowRunTimelineFallbackRow[])) {
    if (!run.created_at) {
      continue;
    }

    const tribe = normalizeTribe(run.tribe);
    if (allowedTribes && !allowedTribes.has(tribe)) {
      continue;
    }

    const dateKey = new Date(run.created_at).toISOString().slice(0, 10);
    const bucket = bucketByDate.get(dateKey);
    if (!bucket) {
      continue;
    }

    bucket.total += 1;
    if (run.status === "success") bucket.success += 1;
    if (run.status === "failed") bucket.failed += 1;
    if (run.status === "running") bucket.running += 1;
    if (run.status === "cancelled") bucket.cancelled += 1;

    const durationSeconds = toNumber(run.duration_seconds);
    if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
      const stats = durationStats.get(dateKey) ?? { total: 0, count: 0 };
      stats.total += durationSeconds;
      stats.count += 1;
      durationStats.set(dateKey, stats);
    }
  }

  for (const bucket of buckets) {
    const stats = durationStats.get(bucket.date);
    bucket.avg_duration_seconds =
      stats && stats.count > 0 ? Math.round(stats.total / stats.count) : 0;
  }

  return buckets;
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
      if (isMissingTimelineRpc(error)) {
        const points = await getTimelineFallback(
          supabase,
          windowDays,
          scopedTribeFilter,
        );
        return NextResponse.json({ window_days: windowDays, data: points });
      }

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
