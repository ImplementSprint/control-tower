import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedAccessScope, requirePlatformAdmin } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";

const channelSchema = z.object({
  tribe: z.string().min(1).max(80).nullable().optional(),
  channel_type: z.enum(["slack_webhook", "in_app"]),
  config: z.record(z.string(), z.unknown()).default({}),
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
      .from("alert_channels")
      .select("id, tribe, channel_type, config, is_enabled, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) return jsonError("Failed to fetch channels.", 500, { details: error.message });
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
    const parsed = channelSchema.safeParse(payload);
    if (!parsed.success) return jsonError("Invalid payload.", 400, { issues: parsed.error.flatten() });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("alert_channels")
      .insert({
        tribe: parsed.data.tribe ?? null,
        channel_type: parsed.data.channel_type,
        config: parsed.data.config,
        is_enabled: parsed.data.is_enabled,
      })
      .select("id, tribe, channel_type, config, is_enabled, created_at, updated_at")
      .single();

    if (error) return jsonError("Failed to create channel.", 500, { details: error.message });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
