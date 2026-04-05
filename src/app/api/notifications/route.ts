import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedAccessScope } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import { parseBoundedIntegerParam } from "@/lib/api/params";

export async function GET(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;

    const searchParams = new URL(request.url).searchParams;
    const limit = parseBoundedIntegerParam({ rawValue: searchParams.get("limit"), defaultValue: 20, min: 1, max: 100 });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("id, tribe, title, body, severity, source_type, source_id, is_read, created_at")
      .eq("user_id", accessScope.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return jsonError("Failed to fetch notifications.", 500, { details: error.message });
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;

    const body = await request.json() as { ids?: string[]; all?: boolean };
    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", accessScope.userId);

    if (!body.all && body.ids && body.ids.length > 0) {
      query = query.in("id", body.ids);
    }

    const { error } = await query;
    if (error) return jsonError("Failed to mark notifications as read.", 500, { details: error.message });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
