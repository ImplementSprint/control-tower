import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limitRaw = Number(searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
      : 100;

    const repository = searchParams.get("repository")?.trim();
    const tribe = searchParams.get("tribe")?.trim();
    const eventType = searchParams.get("eventType")?.trim();
    const source = searchParams.get("source")?.trim();

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("audit_events")
      .select("id, event_type, source, actor, actor_type, repository, tribe, branch, environment, deployment_id, run_id, run_attempt, details, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (repository) {
      query = query.eq("repository", repository);
    }

    if (tribe) {
      query = query.eq("tribe", tribe);
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    if (source) {
      query = query.eq("source", source);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch audit events.",
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
            : "Unexpected error while fetching audit events.",
      },
      { status: 500 },
    );
  }
}
