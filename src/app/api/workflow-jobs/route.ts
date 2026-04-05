import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getScopedTribes } from "@/lib/auth/access";
import { requireAuthenticatedAccessScope } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import {
  getTrimmedSearchParam,
  parseBoundedIntegerParam,
  parseOptionalNumberParam,
} from "@/lib/api/params";

export async function GET(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();

    if (!accessScope) {
      return response;
    }

    const searchParams = new URL(request.url).searchParams;
    const limit = parseBoundedIntegerParam({
      rawValue: searchParams.get("limit"),
      defaultValue: 50,
      min: 1,
      max: 300,
    });

    const repository = getTrimmedSearchParam(searchParams, "repository");
    const tribe = getTrimmedSearchParam(searchParams, "tribe");
    const scopedTribes = getScopedTribes(accessScope, tribe);

    if (scopedTribes !== null && scopedTribes.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const branch = getTrimmedSearchParam(searchParams, "branch");
    const environment = getTrimmedSearchParam(searchParams, "environment");
    const status = getTrimmedSearchParam(searchParams, "status");
    const runIdRaw = getTrimmedSearchParam(searchParams, "runId");
    const runAttemptRaw = getTrimmedSearchParam(searchParams, "runAttempt");

    const runIdParse = parseOptionalNumberParam(runIdRaw, "runId");
    if (runIdParse.error) {
      return jsonError(runIdParse.error, 400);
    }

    const runAttemptParse = parseOptionalNumberParam(runAttemptRaw, "runAttempt");
    if (runAttemptParse.error) {
      return jsonError(runAttemptParse.error, 400);
    }

    const runId = runIdParse.value;
    const runAttempt = runAttemptParse.value;

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("workflow_jobs")
      .select(
        "id, repository, run_id, run_attempt, job_id, name, tribe, branch, environment, status, github_status, github_conclusion, run_url, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (repository) {
      query = query.eq("repository", repository);
    }

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    if (branch) {
      query = query.eq("branch", branch);
    }

    if (environment) {
      query = query.eq("environment", environment);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (runId !== null) {
      query = query.eq("run_id", runId);
    }

    if (runAttempt !== null) {
      query = query.eq("run_attempt", runAttempt);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("Failed to fetch workflow jobs from Supabase.", 500, {
        details: error.message,
      });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unexpected error while fetching workflow jobs.",
      500,
    );
  }
}
