import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  requireAuthenticatedAccessScope,
  requirePlatformAdmin,
} from "@/lib/api/auth";
import { jsonError } from "@/lib/api/responses";
import {
  getTrimmedSearchParam,
  parseBoundedIntegerParam,
} from "@/lib/api/params";

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
    const { accessScope, response } = await requireAuthenticatedAccessScope();

    if (!accessScope) {
      return response;
    }

    const platformAdminError = requirePlatformAdmin(
      accessScope,
      "Only platform admins can view policy rules.",
    );

    if (platformAdminError) {
      return platformAdminError;
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
    const environment = getTrimmedSearchParam(searchParams, "environment");
    const enabled = getTrimmedSearchParam(searchParams, "enabled");

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
      return jsonError("Failed to fetch policy rules.", 500, {
        details: error.message,
      });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unexpected error while fetching policy rules.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const { accessScope, response } = await requireAuthenticatedAccessScope();

    if (!accessScope) {
      return response;
    }

    const platformAdminError = requirePlatformAdmin(
      accessScope,
      "Only platform admins can create policy rules.",
    );

    if (platformAdminError) {
      return platformAdminError;
    }

    const payload = await request.json();
    const parsed = createPolicySchema.safeParse(payload);

    if (!parsed.success) {
      return jsonError("Invalid policy payload.", 400, {
        issues: parsed.error.flatten(),
      });
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
        created_by: parsed.data.createdBy ?? accessScope.email ?? accessScope.userId,
      })
      .select("id, name, rule_type, repository, tribe, environment, is_enabled, config, created_by, created_at, updated_at")
      .single();

    if (error) {
      return jsonError("Failed to create policy rule.", 500, {
        details: error.message,
      });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unexpected error while creating policy rule.",
      500,
    );
  }
}
