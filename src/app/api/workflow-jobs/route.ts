import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limitRaw = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 300)
      : 50;

    const repository = searchParams.get("repository")?.trim();
    const tribe = searchParams.get("tribe")?.trim();
    const branch = searchParams.get("branch")?.trim();
    const environment = searchParams.get("environment")?.trim();
    const status = searchParams.get("status")?.trim();
    const runIdRaw = searchParams.get("runId")?.trim();
    const runAttemptRaw = searchParams.get("runAttempt")?.trim();

    const runId = runIdRaw ? Number(runIdRaw) : null;
    if (runIdRaw && (!Number.isFinite(runId) || runId === null)) {
      return NextResponse.json({ error: "runId must be a number." }, { status: 400 });
    }

    const runAttempt = runAttemptRaw ? Number(runAttemptRaw) : null;
    if (runAttemptRaw && (!Number.isFinite(runAttempt) || runAttempt === null)) {
      return NextResponse.json(
        { error: "runAttempt must be a number." },
        { status: 400 },
      );
    }

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

    if (tribe) {
      query = query.eq("tribe", tribe);
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
      return NextResponse.json(
        {
          error: "Failed to fetch workflow jobs from Supabase.",
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
            : "Unexpected error while fetching workflow jobs.",
      },
      { status: 500 },
    );
  }
}
