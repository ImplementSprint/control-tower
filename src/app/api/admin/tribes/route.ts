import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedAccessScope, requirePlatformAdmin } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";

const upsertTribeSchema = z.object({
  repository: z.string().min(1).max(200),
  tribe: z.string().min(1).max(80),
  is_active: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("repo_tribe_map")
      .select("repository, tribe, is_active, created_at, updated_at")
      .order("tribe", { ascending: true });

    if (error) return jsonError("Failed to fetch tribe mappings.", 500, { details: error.message });
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
    const parsed = upsertTribeSchema.safeParse(payload);
    if (!parsed.success) return jsonError("Invalid payload.", 400, { issues: parsed.error.flatten() });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("repo_tribe_map")
      .upsert(
        { repository: parsed.data.repository, tribe: parsed.data.tribe, is_active: parsed.data.is_active },
        { onConflict: "repository" },
      )
      .select("repository, tribe, is_active, created_at, updated_at")
      .single();

    if (error) return jsonError("Failed to save tribe mapping.", 500, { details: error.message });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();
    if (!accessScope) return response;
    const adminError = requirePlatformAdmin(accessScope);
    if (adminError) return adminError;

    const { repository } = await request.json() as { repository?: string };
    if (!repository) return jsonError("repository is required.", 400);

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("repo_tribe_map")
      .update({ is_active: false })
      .eq("repository", repository);

    if (error) return jsonError("Failed to deactivate tribe mapping.", 500, { details: error.message });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
