import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedAccessScope, requirePlatformAdmin } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";

const createAlertSchema = z.object({
  name: z.string().min(3).max(120),
  tribe: z.string().min(1).max(80).nullable().optional(),
  rule_type: z.enum(["success_rate_below", "failed_run_count_above", "duration_above"]),
  threshold: z.number().positive(),
  window_minutes: z.number().int().min(5).max(43200).default(1440),
  channels: z.array(z.string()).default(["in_app"]),
  is_enabled: z.boolean().default(true),
});

export async function GET() {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("alert_rules")
      .select("id, name, tribe, rule_type, threshold, window_minutes, channels, is_enabled, created_by, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) return jsonError("Failed to fetch alert rules.", 500, { details: error.message });
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const payload = await request.json();
    const parsed = createAlertSchema.safeParse(payload);
    if (!parsed.success) return jsonError("Invalid payload.", 400, { issues: parsed.error.flatten() });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("alert_rules")
      .insert({
        name: parsed.data.name,
        tribe: parsed.data.tribe ?? null,
        rule_type: parsed.data.rule_type,
        threshold: parsed.data.threshold,
        window_minutes: parsed.data.window_minutes,
        channels: parsed.data.channels,
        is_enabled: parsed.data.is_enabled,
        created_by: accessScope.email ?? accessScope.userId,
      })
      .select("id, name, tribe, rule_type, threshold, window_minutes, channels, is_enabled, created_by, created_at, updated_at")
      .single();

    if (error) return jsonError("Failed to create alert rule.", 500, { details: error.message });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
