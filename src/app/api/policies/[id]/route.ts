import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedAccessScope, requirePlatformAdmin } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";

const updatePolicySchema = z.object({
  name: z.string().min(3).max(120).optional(),
  is_enabled: z.boolean().optional(),
  repository: z.string().min(1).max(200).nullable().optional(),
  tribe: z.string().min(1).max(80).nullable().optional(),
  environment: z.enum(["test", "uat", "main"]).nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
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
    const parsed = updatePolicySchema.safeParse(payload);
    if (!parsed.success) return jsonError("Invalid payload.", 400, { issues: parsed.error.flatten() });

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.is_enabled !== undefined) updates.is_enabled = parsed.data.is_enabled;
    if (parsed.data.repository !== undefined) updates.repository = parsed.data.repository;
    if (parsed.data.tribe !== undefined) updates.tribe = parsed.data.tribe;
    if (parsed.data.environment !== undefined) updates.environment = parsed.data.environment;
    if (parsed.data.config !== undefined) updates.config = parsed.data.config;

    if (Object.keys(updates).length === 0) return jsonError("No fields to update.", 400);

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("policy_rules")
      .update(updates)
      .eq("id", id)
      .select("id, name, rule_type, repository, tribe, environment, is_enabled, config, created_by, created_at, updated_at")
      .single();

    if (error) return jsonError("Failed to update policy rule.", 500, { details: error.message });
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
    const { error } = await supabase.from("policy_rules").delete().eq("id", id);

    if (error) return jsonError("Failed to delete policy rule.", 500, { details: error.message });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
