import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedAccessScope, requirePlatformAdmin } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";

const updateAlertSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  is_enabled: z.boolean().optional(),
  threshold: z.number().positive().optional(),
  window_minutes: z.number().int().min(5).max(43200).optional(),
  channels: z.array(z.string()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const { id } = await params;
    const payload = await request.json();
    const parsed = updateAlertSchema.safeParse(payload);
    if (!parsed.success) return jsonError("Invalid payload.", 400, { issues: parsed.error.flatten() });

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.is_enabled !== undefined) updates.is_enabled = parsed.data.is_enabled;
    if (parsed.data.threshold !== undefined) updates.threshold = parsed.data.threshold;
    if (parsed.data.window_minutes !== undefined) updates.window_minutes = parsed.data.window_minutes;
    if (parsed.data.channels !== undefined) updates.channels = parsed.data.channels;

    if (Object.keys(updates).length === 0) return jsonError("No fields to update.", 400);

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("alert_rules")
      .update(updates)
      .eq("id", id)
      .select("id, name, tribe, rule_type, threshold, window_minutes, channels, is_enabled, created_by, created_at, updated_at")
      .single();

    if (error) return jsonError("Failed to update alert rule.", 500, { details: error.message });
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("alert_rules").delete().eq("id", id);

    if (error) return jsonError("Failed to delete alert rule.", 500, { details: error.message });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
