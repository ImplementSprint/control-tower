import { createClient } from "@/lib/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MembershipRow = {
  tribe: string;
  role: string;
};

export type AccessScope = {
  userId: string;
  email: string | null;
  tribes: string[];
  roles: string[];
  isPlatformAdmin: boolean;
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

  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("user_tribe_membership")
    .select("tribe, role")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error) {
    const details = error.message.toLowerCase();
    const isMissingMembershipTable =
      details.includes("user_tribe_membership") &&
      (details.includes("does not exist") || details.includes("not found"));

    if (!isMissingMembershipTable) {
      throw new Error(`Failed to load user tribe memberships: ${error.message}`);
    }
  }

  const memberships = (data ?? []) as MembershipRow[];
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

  return {
    userId: user.id,
    email: user.email ?? null,
    tribes,
    roles,
    isPlatformAdmin: roles.includes("platform_admin"),
  };
}
