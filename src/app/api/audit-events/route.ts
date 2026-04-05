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
      defaultValue: 100,
      min: 1,
      max: 500,
    });

    const repository = getTrimmedSearchParam(searchParams, "repository");
    const tribe = getTrimmedSearchParam(searchParams, "tribe");
    const scopedTribes = getScopedTribes(accessScope, tribe);

    if (scopedTribes !== null && scopedTribes.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const eventType = getTrimmedSearchParam(searchParams, "eventType");
    const source = getTrimmedSearchParam(searchParams, "source");

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("audit_events")
      .select("id, event_type, source, actor, actor_type, repository, tribe, branch, environment, deployment_id, run_id, run_attempt, details, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (repository) {
      query = query.eq("repository", repository);
    }

    if (scopedTribes !== null) {
      query = query.in("tribe", scopedTribes);
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    if (source) {
      query = query.eq("source", source);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("Failed to fetch audit events.", 500, {
        details: error.message,
      });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unexpected error while fetching audit events.",
      500,
    );
  }
}
