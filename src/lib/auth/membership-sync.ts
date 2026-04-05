import { fetchGithubUserTeams } from "@/lib/auth/github-membership";

export type MembershipRole = "viewer" | "lead" | "platform_admin";

export type MembershipAssignment = {
  tribe: string;
  role: MembershipRole;
};

export type AuthenticatedUserLike = {
  email?: string | null;
  app_metadata?: unknown;
  user_metadata?: unknown;
  identities?: Array<{
    provider?: string | null;
    identity_data?: unknown;
  }> | null;
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

function slugToSnakeCase(value: string): string {
  return value.replaceAll(/[\s-]+/g, "_");
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

function parseMembershipMap(rawValue: string | undefined, envName: string) {
  if (!rawValue || rawValue.trim().length === 0) {
    return {} as Record<string, MembershipAssignment>;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Invalid ${envName} JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${envName} JSON: expected object map.`);
  }

  const normalizedMap: Record<string, MembershipAssignment> = {};

  for (const [rawKey, rawConfig] of Object.entries(parsed)) {
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

export async function resolveAutomaticMembershipAssignments({
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

  const userMap = parseMembershipMap(
    process.env.GITHUB_USER_TRIBE_ROLE_MAP_JSON,
    "GITHUB_USER_TRIBE_ROLE_MAP_JSON",
  );

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

  const teamMap = parseMembershipMap(
    process.env.GITHUB_TEAM_TRIBE_ROLE_MAP_JSON,
    "GITHUB_TEAM_TRIBE_ROLE_MAP_JSON",
  );

  const hasTeamMapping = Object.keys(teamMap).length > 0;
  const autoAssign =
    (process.env.AUTO_ASSIGN_TRIBE_FROM_GITHUB_TEAM ?? "false")
      .trim()
      .toLowerCase() === "true";

  if (!hasTeamMapping && !autoAssign) {
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

    if (mapped) {
      addAssignment(assignments, mapped);
    } else if (autoAssign && slug) {
      const tribe = slugToSnakeCase(slug);
      if (tribe) {
        addAssignment(assignments, { tribe, role: "viewer" });
      }
    }
  }

  return {
    assignments: Array.from(assignments.values()),
    scopeMissing: false,
  };
}
