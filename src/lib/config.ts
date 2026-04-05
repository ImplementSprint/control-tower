export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export type SupabaseAdminConfig = {
  url: string;
  secretKey: string;
};

export type GitHubOrgPolicyConfig = {
  requiredOrgs: string[];
  enforceOrgPolicy: boolean;
};

export function resolveSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    const missing: string[] = [];

    if (!url) {
      missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    }

    if (!publishableKey) {
      missing.push(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)",
      );
    }

    throw new Error(`Missing Supabase public environment variables: ${missing.join(", ")}.`);
  }

  return { url, publishableKey };
}

export function resolveSupabaseAdminConfig(): SupabaseAdminConfig {
  const { url } = resolveSupabasePublicConfig();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE;

  if (!secretKey) {
    throw new Error(
      "Missing Supabase admin secret key. Set SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE).",
    );
  }

  return { url, secretKey };
}

export function resolveGitHubOrgPolicyConfig(): GitHubOrgPolicyConfig {
  const requiredOrgs = (
    process.env.GITHUB_ALLOWED_ORG ?? process.env.NEXT_PUBLIC_GITHUB_ALLOWED_ORG ?? ""
  )
    .split(",")
    .map((org) => org.trim())
    .filter((org) => org.length > 0);

  const explicitEnforceToggle =
    (
      process.env.GITHUB_REQUIRE_ORG_MEMBERSHIP ??
      process.env.NEXT_PUBLIC_GITHUB_REQUIRE_ORG_MEMBERSHIP ??
      "false"
    )
      .trim()
      .toLowerCase() === "true";

  return {
    requiredOrgs,
    enforceOrgPolicy: explicitEnforceToggle || requiredOrgs.length > 0,
  };
}
