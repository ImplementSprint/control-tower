import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  DeploymentEnvironment,
  DeploymentStatus,
} from "@/lib/supabase/types";

export type GovernanceViolation = {
  ruleId: string;
  ruleName: string;
  message: string;
};

type PolicyRule = {
  id: string;
  name: string;
  rule_type: "block_environment" | "block_status" | "require_summary_on_status";
  repository: string | null;
  tribe: string | null;
  environment: DeploymentEnvironment | null;
  config: Record<string, unknown>;
};

export type DeploymentPolicyContext = {
  repository: string;
  tribe: string;
  environment: DeploymentEnvironment;
  status: DeploymentStatus;
  summary: string | null;
};

export type AuditEventInput = {
  eventType: string;
  source: string;
  actor?: string | null;
  actorType?: "system" | "user" | "webhook" | "sync";
  repository?: string | null;
  tribe?: string | null;
  branch?: string | null;
  environment?: DeploymentEnvironment | null;
  deploymentId?: string | null;
  runId?: number | null;
  runAttempt?: number | null;
  details?: Record<string, unknown>;
};

function deriveTribeFromHeuristics(repository: string) {
  const repoName =
    repository
      .split("/")
      .at(-1)
      ?.toLowerCase()
      .replace(/\.git$/, "") ?? repository.toLowerCase();
  const conventionMatch = repoName.match(/^([a-z0-9][a-z0-9-]*)-(fe|be|mobile)$/);

  if (conventionMatch?.[1]) {
    return conventionMatch[1];
  }

  const normalized = repository.toLowerCase();

  if (normalized.includes("api_center") || normalized.includes("api-center")) {
    return "apicenter";
  }

  if (normalized.includes("campus")) {
    return "campusone";
  }

  if (normalized.includes("workflow") || normalized.includes("control-tower")) {
    return "cicd";
  }

  return "unmapped";
}

async function persistDerivedTribeMapping(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  repository: string,
  tribe: string,
) {
  if (!tribe || tribe === "unmapped") {
    return;
  }

  const repoName = repository.split("/").at(-1)?.trim() ?? "";
  const keys = Array.from(
    new Set([repository.trim(), repoName].filter((value) => value.length > 0)),
  );

  if (keys.length === 0) {
    return;
  }

  const rows = keys.map((value) => ({
    repository: value,
    tribe,
    is_active: true,
  }));

  const { error } = await supabase
    .from("repo_tribe_map")
    .upsert(rows, { onConflict: "repository" });

  if (error) {
    throw new Error(`Failed to persist derived tribe mapping: ${error.message}`);
  }
}

export async function resolveTribeForRepository(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  repository: string,
) {
  const mappingSource = process.env.TRIBE_REPO_MAP_JSON;
  const repoName = repository.split("/").at(-1) ?? repository;

  if (mappingSource) {
    try {
      const mapping = JSON.parse(mappingSource) as Record<string, string>;
      if (mapping[repository]) {
        return mapping[repository];
      }

      if (mapping[repoName]) {
        return mapping[repoName];
      }
    } catch {
      // Ignore malformed JSON and continue with lookup fallback.
    }
  }

  const { data, error } = await supabase
    .from("repo_tribe_map")
    .select("tribe")
    .eq("is_active", true)
    .in("repository", [repository, repoName])
    .limit(1)
    .maybeSingle();

  if (!error && data?.tribe) {
    return data.tribe;
  }

  const fallbackTribe = deriveTribeFromHeuristics(repository);

  try {
    await persistDerivedTribeMapping(supabase, repository, fallbackTribe);
  } catch {
    // Keep request path resilient if mapping persistence fails.
  }

  return fallbackTribe;
}

function isRuleInScope(rule: PolicyRule, context: DeploymentPolicyContext) {
  const repoName = context.repository.split("/").at(-1) ?? context.repository;

  if (rule.repository && rule.repository !== context.repository && rule.repository !== repoName) {
    return false;
  }

  if (rule.tribe && rule.tribe !== context.tribe) {
    return false;
  }

  if (rule.environment && rule.environment !== context.environment) {
    return false;
  }

  return true;
}

function getStringArray(config: Record<string, unknown>, key: string, fallback: string[]) {
  const value = config[key];
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.toLowerCase() : ""))
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : fallback;
}

export async function evaluateDeploymentMutationPolicies(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  context: DeploymentPolicyContext,
) {
  const { data, error } = await supabase
    .from("policy_rules")
    .select("id, name, rule_type, repository, tribe, environment, config")
    .eq("is_enabled", true);

  if (error) {
    throw new Error(`Failed to load policy rules: ${error.message}`);
  }

  const rules = (data ?? []) as PolicyRule[];
  const violations: GovernanceViolation[] = [];

  for (const rule of rules) {
    if (!isRuleInScope(rule, context)) {
      continue;
    }

    if (rule.rule_type === "block_environment") {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Environment ${context.environment} is blocked by policy ${rule.name}.`,
      });
      continue;
    }

    if (rule.rule_type === "block_status") {
      const statuses = getStringArray(rule.config, "statuses", ["success"]);
      if (statuses.includes(context.status)) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          message: `Status ${context.status} is blocked by policy ${rule.name}.`,
        });
      }
      continue;
    }

    if (rule.rule_type === "require_summary_on_status") {
      const statuses = getStringArray(rule.config, "statuses", ["failed", "cancelled"]);
      const minLengthRaw = rule.config.minLength;
      const minLength =
        typeof minLengthRaw === "number" && Number.isFinite(minLengthRaw)
          ? Math.max(1, Math.trunc(minLengthRaw))
          : 12;

      const summaryLength = (context.summary ?? "").trim().length;
      if (statuses.includes(context.status) && summaryLength < minLength) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          message: `Summary is required with at least ${minLength} characters for status ${context.status}.`,
        });
      }
    }
  }

  return violations;
}

export async function createAuditEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: AuditEventInput,
) {
  const { error } = await supabase.from("audit_events").insert({
    event_type: input.eventType,
    source: input.source,
    actor: input.actor ?? null,
    actor_type: input.actorType ?? "system",
    repository: input.repository ?? null,
    tribe: input.tribe ?? null,
    branch: input.branch ?? null,
    environment: input.environment ?? null,
    deployment_id: input.deploymentId ?? null,
    run_id: input.runId ?? null,
    run_attempt: input.runAttempt ?? null,
    details: input.details ?? {},
  });

  if (error) {
    throw new Error(`Failed to create audit event: ${error.message}`);
  }
}
