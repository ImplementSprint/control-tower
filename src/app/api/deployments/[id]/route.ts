import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateDeploymentSchema } from "@/lib/supabase/types";

const requestSchema = updateDeploymentSchema.extend({
  durationSeconds: z.preprocess((value) => {
    if (value === "" || value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      return Number(value);
    }

    return value;
  }, z.number().int().min(0).max(172800).nullable().optional()),
  summary: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, z.string().max(500).nullable().optional()),
}).refine(
  (value) =>
    value.status || value.summary !== undefined || value.durationSeconds !== undefined,
  {
    message: "At least one field must be provided",
  },
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Deployment id is required." }, { status: 400 });
    }

    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const updates: Record<string, string | number | null> = {};

    if (parsed.data.status) {
      updates.status = parsed.data.status;
    }

    if (parsed.data.summary !== undefined) {
      updates.summary = parsed.data.summary;
    }

    if (parsed.data.durationSeconds !== undefined) {
      updates.duration_seconds = parsed.data.durationSeconds;
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("deployments")
      .update(updates)
      .eq("id", id)
      .select("id, repository, branch, environment, status, summary, commit_sha, duration_seconds, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: "Unable to update deployment.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    revalidatePath("/");
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while updating deployment.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
