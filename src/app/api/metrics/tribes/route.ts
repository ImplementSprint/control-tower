import { NextResponse } from "next/server";
import { getScopedTribes } from "@/lib/auth/access";
import { requireAuthenticatedAccessScope } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import {
  getTrimmedSearchParam,
  parseBoundedIntegerParam,
} from "@/lib/api/params";
import { getTribeHealth } from "@/lib/dashboard/tribe-health";

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
    const effectiveScope =
      scopedTribes === null
        ? accessScope
        : {
            ...accessScope,
            isPlatformAdmin: false,
            tribes: scopedTribes,
          };

    const { rows, error } = await getTribeHealth(effectiveScope, windowDays);

    if (error) {
      return jsonError(error, 500);
    }

    const sampledRuns = rows.reduce((total, row) => total + row.totalRuns, 0);
    const metrics: TribeMetricRow[] = rows.map((row) => ({
      tribe: row.tribe,
      total_runs: row.totalRuns,
      success_count: row.successCount,
      failed_count: row.failedRuns,
      running_count: row.runningRuns,
      cancelled_count: row.cancelledRuns,
      success_rate: row.successRate,
      average_duration_seconds: row.averageDurationSeconds,
      last_completed_at: row.lastCompletedAt,
    }));

    return NextResponse.json({
      window_days: windowDays,
      sampled_runs: sampledRuns,
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
