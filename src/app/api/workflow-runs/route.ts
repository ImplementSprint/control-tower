import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedAccessScope,
  getScopedTribes,
} from "@/lib/auth/access";

export async function GET(request: Request) {
  try {
    const accessScope = await getAuthenticatedAccessScope();

    if (!accessScope) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const searchParams = new URL(request.url).searchParams;
    const limitParam = Number(searchParams.get("limit") ?? "30");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 200)
      : 30;

    const tribe = searchParams.get("tribe")?.trim() ?? null;
    const scopedTribes = getScopedTribes(accessScope, tribe);

    if (scopedTribes !== null && scopedTribes.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const branch = searchParams.get("branch")?.trim();
    const repository = searchParams.get("repository")?.trim();
    const status = searchParams.get("status")?.trim();

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
      return NextResponse.json(
        {
          error: "Failed to fetch workflow runs from Supabase.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while fetching workflow runs.",
      },
      { status: 500 },
    );
  }
}
