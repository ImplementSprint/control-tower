import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseRouteContext = {
  supabase: ReturnType<typeof createServerClient>;
  sessionResponse: NextResponse;
};

type MembershipRole = "viewer" | "lead" | "platform_admin";

type MembershipAssignment = {
  tribe: string;
  role: MembershipRole;
};

type AuthenticatedUserLike = {
  email?: string | null;
  app_metadata?: unknown;
  user_metadata?: unknown;
  identities?: Array<{
    provider?: string | null;
    identity_data?: unknown;
  }> | null;
};

type GithubTeam = {
  slug?: string | null;
  organization?: {
    login?: string | null;
  } | null;
};

const MEMBERSHIP_ROLE_PRIORITY: Record<MembershipRole, number> = {
  viewer: 1,
  lead: 2,
  platform_admin: 3,
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function normalizeMembershipRole(value: unknown): MembershipRole {
  const normalized = normalizeText(value);

  if (normalized === "platform_admin" || normalized === "lead") {
    return normalized;
  }

  return "viewer";
}

function normalizeTribe(value: unknown) {
  const normalized = normalizeText(value);

  if (!normalized || normalized === "*") {
    return "";
  }

  return normalized;
}

function addAssignment(
  assignments: Map<string, MembershipAssignment>,
  next: MembershipAssignment,
) {
  const current = assignments.get(next.tribe);

  if (
    !current ||
    MEMBERSHIP_ROLE_PRIORITY[next.role] > MEMBERSHIP_ROLE_PRIORITY[current.role]
  ) {
    assignments.set(next.tribe, next);
  }
}

function parseMembershipMap(rawValue: string | undefined) {
  if (!rawValue || rawValue.trim().length === 0) {
    return {} as Record<string, MembershipAssignment>;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    const normalizedMap: Record<string, MembershipAssignment> = {};

    for (const [rawKey, rawConfig] of Object.entries(parsed ?? {})) {
      const key = normalizeText(rawKey);

      if (!key) {
        continue;
      }

      if (typeof rawConfig === "string") {
        const tribe = normalizeTribe(rawConfig);

        if (!tribe) {
          continue;
        }

        normalizedMap[key] = {
          tribe,
          role: "viewer",
        };
        continue;
      }

      if (!rawConfig || typeof rawConfig !== "object") {
        continue;
      }

      const config = rawConfig as Record<string, unknown>;
      const tribe = normalizeTribe(config.tribe);

      if (!tribe) {
        continue;
      }

      normalizedMap[key] = {
        tribe,
        role: normalizeMembershipRole(config.role),
      };
    }

    return normalizedMap;
  } catch {
    return {} as Record<string, MembershipAssignment>;
  }
}

function resolveGithubUsername(user: AuthenticatedUserLike) {
  const metadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : undefined;

  const githubIdentity = user.identities?.find(
    (identity) => identity?.provider === "github",
  );
  const identityData =
    githubIdentity?.identity_data && typeof githubIdentity.identity_data === "object"
      ? (githubIdentity.identity_data as Record<string, unknown>)
      : undefined;

  return (
    normalizeText(metadata?.user_name) ||
    normalizeText(metadata?.preferred_username) ||
    normalizeText(identityData?.user_name) ||
    ""
  );
}

async function fetchGithubUserTeams(providerToken: string) {
  const response = await fetch("https://api.github.com/user/teams?per_page=100", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${providerToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    return {
      teams: [] as GithubTeam[],
      scopeMissing: true,
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub team membership check failed with ${response.status}`);
  }

  const payload = (await response.json()) as GithubTeam[];

  return {
    teams: Array.isArray(payload) ? payload : [],
    scopeMissing: false,
  };
}

async function resolveAutomaticMembershipAssignments({
  user,
  providerToken,
}: {
  user: AuthenticatedUserLike;
  providerToken: string | null;
}) {
  const assignments = new Map<string, MembershipAssignment>();

  const metadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : undefined;
  const appMetadata =
    user.app_metadata && typeof user.app_metadata === "object"
      ? (user.app_metadata as Record<string, unknown>)
      : undefined;

  const metadataTribe = normalizeTribe(metadata?.tribe);
  if (metadataTribe) {
    addAssignment(assignments, {
      tribe: metadataTribe,
      role: normalizeMembershipRole(appMetadata?.role ?? metadata?.role),
    });
  }

  const userMap = parseMembershipMap(process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON);
  const identityCandidates = [
    resolveGithubUsername(user),
    normalizeText(user.email),
  ].filter((value) => value.length > 0);

  for (const candidate of identityCandidates) {
    const mapped = userMap[candidate];

    if (!mapped) {
      continue;
    }

    addAssignment(assignments, mapped);
    break;
  }

  const teamMap = parseMembershipMap(process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON);
  const hasTeamMapping = Object.keys(teamMap).length > 0;

  if (!hasTeamMapping) {
    return {
      assignments: Array.from(assignments.values()),
      scopeMissing: false,
    };
  }

  if (!providerToken) {
    return {
      assignments: Array.from(assignments.values()),
      scopeMissing: true,
    };
  }

  const { teams, scopeMissing } = await fetchGithubUserTeams(providerToken);

  if (scopeMissing) {
    return {
      assignments: Array.from(assignments.values()),
      scopeMissing: true,
    };
  }

  for (const team of teams) {
    const slug = normalizeText(team.slug);
    const org = normalizeText(team.organization?.login);
    const fullKey = org && slug ? `${org}/${slug}` : "";

    const mapped =
      (fullKey ? teamMap[fullKey] : undefined) || (slug ? teamMap[slug] : undefined);

    if (!mapped) {
      continue;
    }

    addAssignment(assignments, mapped);
  }

  return {
    assignments: Array.from(assignments.values()),
    scopeMissing: false,
  };
}

function resolveSafeNextPath(rawNext: string | null) {
  if (!rawNext) {
    return "/";
  }

  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return "/";
  }

  if (
    rawNext.startsWith("/auth/login") ||
    rawNext.startsWith("/auth/callback")
  ) {
    return "/";
  }

  return rawNext;
}

async function isAllowedGithubOrgMember(providerToken: string, org: string) {
  const response = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${providerToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return {
      allowed: false,
      scopeMissing: false,
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      allowed: false,
      scopeMissing: true,
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub org membership check failed with ${response.status}`);
  }

  const payload = (await response.json()) as { state?: string };
  return {
    allowed: payload.state === "active" || payload.state === "pending",
    scopeMissing: false,
  };
}

async function createSupabaseRouteContext(): Promise<SupabaseRouteContext> {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "Missing Supabase public environment variables for OAuth callback.",
    );
  }

  const sessionResponse = NextResponse.next();
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          sessionResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  return {
    supabase,
    sessionResponse,
  };
}

function redirectWithSessionCookies(sessionResponse: NextResponse, redirectUrl: URL) {
  const redirectResponse = NextResponse.redirect(redirectUrl);

  for (const cookie of sessionResponse.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    redirectResponse.cookies.set(name, value, {
      ...options,
      path: options.path ?? "/",
      sameSite: options.sameSite ?? "lax",
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? process.env.NODE_ENV === "production",
    });
  }

  return redirectResponse;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = resolveSafeNextPath(url.searchParams.get("next"));
  const { supabase, sessionResponse } = await createSupabaseRouteContext();

  if (!code) {
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "missing_oauth_code");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "oauth_exchange_failed");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  const requiredOrgs = (
    process.env.GITHUB_ALLOWED_ORG ??
    process.env.NEXT_PUBLIC_GITHUB_ALLOWED_ORG ??
    ""
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

  // Enforce org policy when explicitly enabled OR when allowed orgs are configured.
  const enforceOrgPolicy = explicitEnforceToggle || requiredOrgs.length > 0;

  if (enforceOrgPolicy && requiredOrgs.length === 0) {
    await supabase.auth.signOut();
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "org_policy_misconfigured");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  if (enforceOrgPolicy && requiredOrgs.length > 0) {
    const providerToken = data.session.provider_token;

    if (!providerToken) {
      await supabase.auth.signOut();
      const redirectUrl = new URL("/auth/login", url.origin);
      redirectUrl.searchParams.set("error", "github_scope_missing");
      return redirectWithSessionCookies(sessionResponse, redirectUrl);
    }

    try {
      let isAllowed = false;
      let scopeMissing = false;

      for (const org of requiredOrgs) {
        const result = await isAllowedGithubOrgMember(providerToken, org);

        if (result.scopeMissing) {
          scopeMissing = true;
          continue;
        }

        if (result.allowed) {
          isAllowed = true;
          break;
        }
      }

      if (!isAllowed) {
        await supabase.auth.signOut();
        const redirectUrl = new URL("/auth/login", url.origin);
        redirectUrl.searchParams.set(
          "error",
          scopeMissing ? "github_scope_missing" : "org_membership_required",
        );
        return redirectWithSessionCookies(sessionResponse, redirectUrl);
      }
    } catch {
      await supabase.auth.signOut();
      const redirectUrl = new URL("/auth/login", url.origin);
      redirectUrl.searchParams.set("error", "org_check_failed");
      return redirectWithSessionCookies(sessionResponse, redirectUrl);
    }
  }

  const authenticatedUserId =
    data.user?.id ?? data.session?.user?.id ?? null;

  if (authenticatedUserId) {
    try {
      const adminClient = createSupabaseAdminClient();
      const { assignments: autoAssignments, scopeMissing: autoSyncScopeMissing } =
        await resolveAutomaticMembershipAssignments({
          user: (data.user ?? {
            email: data.session.user?.email ?? null,
          }) as AuthenticatedUserLike,
          providerToken: data.session.provider_token ?? null,
        });

      if (autoSyncScopeMissing) {
        await supabase.auth.signOut();
        const redirectUrl = new URL("/auth/login", url.origin);
        redirectUrl.searchParams.set("error", "github_scope_missing");
        return redirectWithSessionCookies(sessionResponse, redirectUrl);
      }

      if (autoAssignments.length > 0) {
        const { error: upsertError } = await adminClient
          .from("user_tribe_membership")
          .upsert(
            autoAssignments.map((item) => ({
              user_id: authenticatedUserId,
              tribe: item.tribe,
              role: item.role,
              is_active: true,
            })),
            { onConflict: "user_id,tribe" },
          );

        if (upsertError) {
          const deniedUrl = new URL("/auth/denied", url.origin);
          deniedUrl.searchParams.set("reason", "membership_check_failed");
          deniedUrl.searchParams.set("next", nextPath);
          return redirectWithSessionCookies(sessionResponse, deniedUrl);
        }
      }

      const { data: memberships, error: membershipError } = await adminClient
        .from("user_tribe_membership")
        .select("id")
        .eq("user_id", authenticatedUserId)
        .eq("is_active", true)
        .limit(1);

      if (membershipError) {
        const deniedUrl = new URL("/auth/denied", url.origin);
        deniedUrl.searchParams.set("reason", "membership_table_unavailable");
        deniedUrl.searchParams.set("next", nextPath);
        return redirectWithSessionCookies(sessionResponse, deniedUrl);
      }

      if (!memberships || memberships.length === 0) {
        const metadataRole =
          typeof data.user?.app_metadata?.role === "string"
            ? data.user.app_metadata.role.trim().toLowerCase()
            : "";
        const metadataTribe =
          typeof data.user?.user_metadata?.tribe === "string"
            ? data.user.user_metadata.tribe.trim().toLowerCase()
            : "";

        const hasMetadataFallbackAccess =
          metadataRole === "platform_admin" || metadataTribe.length > 0;

        if (hasMetadataFallbackAccess) {
          const redirectUrl = new URL(nextPath, url.origin);
          return redirectWithSessionCookies(sessionResponse, redirectUrl);
        }

        const deniedUrl = new URL("/auth/denied", url.origin);
        deniedUrl.searchParams.set("reason", "tribe_membership_required");
        deniedUrl.searchParams.set("next", nextPath);
        return redirectWithSessionCookies(sessionResponse, deniedUrl);
      }
    } catch {
      const deniedUrl = new URL("/auth/denied", url.origin);
      deniedUrl.searchParams.set("reason", "membership_check_failed");
      deniedUrl.searchParams.set("next", nextPath);
      return redirectWithSessionCookies(sessionResponse, deniedUrl);
    }
  }

  const redirectUrl = new URL(nextPath, url.origin);
  return redirectWithSessionCookies(sessionResponse, redirectUrl);
}
