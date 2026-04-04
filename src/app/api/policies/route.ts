import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const policyRuleTypes = [
  "block_environment",
  "block_status",
  "require_summary_on_status",
] as const;

const createPolicySchema = z.object({
  name: z.string().min(3).max(120),
  ruleType: z.enum(policyRuleTypes),
  repository: z.string().min(1).max(200).optional(),
  tribe: z.string().min(1).max(80).optional(),
  environment: z.enum(["test", "uat", "main"] as const).optional(),
  isEnabled: z.boolean().optional().default(true),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  createdBy: z.string().min(1).max(120).optional(),
});

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const limitRaw = Number(searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
      : 100;

    const repository = searchParams.get("repository")?.trim();
    const tribe = searchParams.get("tribe")?.trim();
    const environment = searchParams.get("environment")?.trim();
    const enabled = searchParams.get("enabled")?.trim();

    const supabase = createSupabaseAdminClient();

    let query = supabase
      .from("policy_rules")
      .select("id, name, rule_type, repository, tribe, environment, is_enabled, config, created_by, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (repository) {
      query = query.eq("repository", repository);
    }

    if (tribe) {
      query = query.eq("tribe", tribe);
    }

    if (environment) {
      query = query.eq("environment", environment);
    }

    if (enabled === "true") {
      query = query.eq("is_enabled", true);
    } else if (enabled === "false") {
      query = query.eq("is_enabled", false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch policy rules.",
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
            : "Unexpected error while fetching policy rules.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = createPolicySchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid policy payload.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("policy_rules")
      .insert({
        name: parsed.data.name,
        rule_type: parsed.data.ruleType,
        repository: parsed.data.repository ?? null,
        tribe: parsed.data.tribe ?? null,
        environment: parsed.data.environment ?? null,
        is_enabled: parsed.data.isEnabled,
        config: parsed.data.config,
        created_by: parsed.data.createdBy ?? null,
      })
      .select("id, name, rule_type, repository, tribe, environment, is_enabled, config, created_by, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to create policy rule.",
          details: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while creating policy rule.",
      },
      { status: 500 },
    );
  }
}
