import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getScopedTribes } from "@/lib/auth/access";
import { requireAuthenticatedAccessScope } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import {
  getTrimmedSearchParam,
  parseBoundedIntegerParam,
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
      defaultValue: 30,
      min: 1,
      max: 200,
    });

    const tribe = getTrimmedSearchParam(searchParams, "tribe");
    const scopedTribes = getScopedTribes(accessScope, tribe);

    if (scopedTribes !== null && scopedTribes.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const branch = getTrimmedSearchParam(searchParams, "branch");
    const repository = getTrimmedSearchParam(searchParams, "repository");
    const status = getTrimmedSearchParam(searchParams, "status");

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("workflow_runs")
      .select(
        "id, repository, run_id, run_attempt, workflow_name, branch, environment, tribe, status, github_status, github_conclusion, event_name, action, run_url, commit_sha, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    if (branch) {
      query = query.eq("branch", branch);
    }

    if (repository) {
      query = query.eq("repository", repository);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("Failed to fetch workflow runs from Supabase.", 500, {
        details: error.message,
      });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unexpected error while fetching workflow runs.",
      500,
    );
  }
}
