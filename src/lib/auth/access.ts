import { createClient } from "@/lib/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { unstable_cache } from "next/cache";

type MembershipRow = {
  tribe: string;
  role: string;
};

const getCachedMembershipRows = unstable_cache(
  async (userId: string) => {
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("user_tribe_membership")
      .select("tribe, role")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(100);

    if (error) {
      const details = error.message.toLowerCase();
      const isMissingMembershipTable =
        details.includes("user_tribe_membership") &&
        (details.includes("does not exist") || details.includes("not found"));

      if (isMissingMembershipTable) {
        return [] as MembershipRow[];
      }

      throw new Error(`Failed to load user tribe memberships: ${error.message}`);
    }

    return (data ?? []) as MembershipRow[];
  },
  ["auth-access-scope-memberships"],
  {
    revalidate: 120,
    tags: ["user-memberships"],
  },
);

export type AccessScope = {
  userId: string;
  email: string | null;
  tribes: string[];
  roles: string[];
  isPlatformAdmin: boolean;
  githubUsername: string | null;
  githubDisplayName: string | null;
  githubAvatarUrl: string | null;
  githubProfileUrl: string | null;
};

function normalizeRole(value: unknown) {
  if (typeof value !== "string") {
    return "viewer";
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "viewer";
}

function normalizeTribe(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function getScopedTribes(scope: AccessScope, requestedTribe?: string | null) {
  const tribeFilter = normalizeTribe(requestedTribe ?? null);

  if (scope.isPlatformAdmin) {
    if (!tribeFilter) {
      return null;
    }

    return [tribeFilter];
  }

  if (!tribeFilter) {
    return scope.tribes;
  }

  if (!scope.tribes.includes(tribeFilter)) {
    return [];
  }

  return [tribeFilter];
}

export async function getAuthenticatedAccessScope(): Promise<AccessScope | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const memberships = await getCachedMembershipRows(user.id);
  const roles = Array.from(new Set(memberships.map((row) => normalizeRole(row.role))));
  const tribes = Array.from(
    new Set(
      memberships
        .map((row) => normalizeTribe(row.tribe))
        .filter((value): value is string => Boolean(value) && value !== "*"),
    ),
  );

  const metadataRole = normalizeRole(user.app_metadata?.role);
  const metadataTribe = normalizeTribe(user.user_metadata?.tribe);

  if (!roles.includes(metadataRole)) {
    roles.push(metadataRole);
  }

  if (metadataTribe && !tribes.includes(metadataTribe)) {
    tribes.push(metadataTribe);
  }

  const githubIdentity = user.identities?.find(
    (identity) => identity.provider === "github",
  );
  const identityData =
    githubIdentity?.identity_data && typeof githubIdentity.identity_data === "object"
      ? (githubIdentity.identity_data as Record<string, unknown>)
      : undefined;

  const metadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : undefined;

  const githubUsername =
    (typeof metadata?.user_name === "string" && metadata.user_name) ||
    (typeof metadata?.preferred_username === "string" && metadata.preferred_username) ||
    (typeof identityData?.user_name === "string" && identityData.user_name) ||
    null;

  const githubDisplayName =
    (typeof metadata?.name === "string" && metadata.name) ||
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    (typeof identityData?.name === "string" && identityData.name) ||
    githubUsername ||
    user.email ||
    null;

  const githubAvatarUrl =
    (typeof metadata?.avatar_url === "string" && metadata.avatar_url) ||
    (typeof metadata?.picture === "string" && metadata.picture) ||
    (typeof identityData?.avatar_url === "string" && identityData.avatar_url) ||
    null;

  const githubProfileUrl =
    (typeof metadata?.profile_url === "string" && metadata.profile_url) ||
    (typeof metadata?.html_url === "string" && metadata.html_url) ||
    (typeof identityData?.profile_url === "string" && identityData.profile_url) ||
    (typeof identityData?.html_url === "string" && identityData.html_url) ||
    null;

  return {
    userId: user.id,
    email: user.email ?? null,
    tribes,
    roles,
    isPlatformAdmin: roles.includes("platform_admin"),
    githubUsername,
    githubDisplayName,
    githubAvatarUrl,
    githubProfileUrl,
  };
}
