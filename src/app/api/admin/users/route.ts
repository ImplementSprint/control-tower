import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedAccessScope, requirePlatformAdmin } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";

const membershipSchema = z.object({
  user_id: z.string().uuid(),
  tribe: z.string().min(1).max(80),
  role: z.enum(["viewer", "lead", "platform_admin"]),
  is_active: z.boolean().optional().default(true),
});

const updateMembershipSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["viewer", "lead", "platform_admin"]).optional(),
  is_active: z.boolean().optional(),
});

export async function GET() {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const supabase = createSupabaseAdminClient();

    const [membershipsResult, usersResult] = await Promise.all([
      supabase
        .from("user_tribe_membership")
        .select("id, user_id, tribe, role, is_active, created_at, updated_at")
        .order("updated_at", { ascending: false }),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    if (membershipsResult.error) {
      return jsonError("Failed to fetch memberships.", 500, { details: membershipsResult.error.message });
    }

    const userMap = new Map(
      (usersResult.data?.users ?? []).map((u) => [
        u.id,
        {
          email: u.email,
          github_username:
            (u.user_metadata?.user_name as string | undefined) ??
            (u.user_metadata?.preferred_username as string | undefined) ??
            null,
        },
      ]),
    );

    const data = (membershipsResult.data ?? []).map((m) => ({
      ...m,
      user: userMap.get(m.user_id) ?? { email: null, github_username: null },
    }));

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
    const parsed = membershipSchema.safeParse(payload);
    if (!parsed.success) return jsonError("Invalid payload.", 400, { issues: parsed.error.flatten() });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_tribe_membership")
      .upsert(
        { user_id: parsed.data.user_id, tribe: parsed.data.tribe, role: parsed.data.role, is_active: parsed.data.is_active },
        { onConflict: "user_id,tribe" },
      )
      .select("id, user_id, tribe, role, is_active, created_at, updated_at")
      .single();

    if (error) return jsonError("Failed to save membership.", 500, { details: error.message });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const payload = await request.json();
    const parsed = updateMembershipSchema.safeParse(payload);
    if (!parsed.success) return jsonError("Invalid payload.", 400, { issues: parsed.error.flatten() });

    const updates: Record<string, unknown> = {};
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;

    if (Object.keys(updates).length === 0) return jsonError("No fields to update.", 400);

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_tribe_membership")
      .update(updates)
      .eq("id", parsed.data.id)
      .select("id, user_id, tribe, role, is_active, created_at, updated_at")
      .single();

    if (error) return jsonError("Failed to update membership.", 500, { details: error.message });
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
