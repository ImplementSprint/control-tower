import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  resolveGitHubOrgPolicyConfig,
  resolveSupabasePublicConfig,
} from "@/lib/config";
import {
  resolveAutomaticMembershipAssignments,
  type AuthenticatedUserLike,
} from "@/lib/auth/membership-sync";
import { isAllowedGithubOrgMember } from "@/lib/auth/github-membership";
import {
  redirectWithSessionCookies,
  resolveSafeNextPath,
} from "@/lib/auth/callback-response";

type SupabaseRouteContext = {
  supabase: ReturnType<typeof createServerClient>;
  sessionResponse: NextResponse;
};

async function createSupabaseRouteContext(): Promise<SupabaseRouteContext> {
  const cookieStore = await cookies();
  const { url, publishableKey } = resolveSupabasePublicConfig();

  const sessionResponse = NextResponse.next();
  const supabase = createServerClient(url, publishableKey, {
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = resolveSafeNextPath(url.searchParams.get("next"));
  const { supabase, sessionResponse } = await createSupabaseRouteContext();

  console.log("[auth/callback] started", { hasCode: !!code, nextPath });

  if (!code) {
    console.log("[auth/callback] FAIL: missing_oauth_code");
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "missing_oauth_code");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.log("[auth/callback] FAIL: oauth_exchange_failed", error?.message);
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "oauth_exchange_failed");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  console.log("[auth/callback] session exchanged", {
    userId: data.user?.id,
    hasProviderToken: !!data.session.provider_token,
    email: data.session.user?.email,
  });

  const { requiredOrgs, enforceOrgPolicy } = resolveGitHubOrgPolicyConfig();

  console.log("[auth/callback] org policy", { enforceOrgPolicy, requiredOrgs });

  if (enforceOrgPolicy && requiredOrgs.length === 0) {
    console.log("[auth/callback] FAIL: org_policy_misconfigured");
    await supabase.auth.signOut();
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "org_policy_misconfigured");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  if (enforceOrgPolicy && requiredOrgs.length > 0) {
    const providerToken = data.session.provider_token;

    if (!providerToken) {
      console.log("[auth/callback] FAIL: github_scope_missing (no provider token)");
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
        console.log("[auth/callback] org check", { org, allowed: result.allowed, scopeMissing: result.scopeMissing });

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
        const errorType = scopeMissing ? "github_scope_missing" : "org_membership_required";
        console.log("[auth/callback] FAIL:", errorType);
        await supabase.auth.signOut();
        const redirectUrl = new URL("/auth/login", url.origin);
        redirectUrl.searchParams.set("error", errorType);
        return redirectWithSessionCookies(sessionResponse, redirectUrl);
      }
    } catch (orgError) {
      console.log("[auth/callback] FAIL: org_check_failed", orgError instanceof Error ? orgError.message : orgError);
      await supabase.auth.signOut();
      const redirectUrl = new URL("/auth/login", url.origin);
      redirectUrl.searchParams.set("error", "org_check_failed");
      return redirectWithSessionCookies(sessionResponse, redirectUrl);
    }
  }

  console.log("[auth/callback] org policy passed");

  const authenticatedUserId = data.user?.id ?? data.session.user?.id ?? null;

  if (authenticatedUserId) {
    try {
      const adminClient = createSupabaseAdminClient();
      let autoAssignmentsResult: Awaited<
        ReturnType<typeof resolveAutomaticMembershipAssignments>
      >;

      try {
        console.log("[auth/callback] resolving auto membership assignments...");
        autoAssignmentsResult = await resolveAutomaticMembershipAssignments({
          user: (data.user ?? {
            email: data.session.user?.email ?? null,
          }) as AuthenticatedUserLike,
          providerToken: data.session.provider_token ?? null,
        });
        console.log("[auth/callback] auto assignments result", {
          count: autoAssignmentsResult.assignments.length,
          scopeMissing: autoAssignmentsResult.scopeMissing,
          tribes: autoAssignmentsResult.assignments.map((a) => a.tribe),
        });
      } catch (error) {
        const details = error instanceof Error ? error.message : "Unknown error";
        const isMembershipMapMisconfigured =
          details.includes("GITHUB_USER_TRIBE_ROLE_MAP_JSON") ||
          details.includes("GITHUB_TEAM_TRIBE_ROLE_MAP_JSON");

        if (isMembershipMapMisconfigured) {
          await supabase.auth.signOut();
          const redirectUrl = new URL("/auth/login", url.origin);
          redirectUrl.searchParams.set("error", "membership_map_misconfigured");
          return redirectWithSessionCookies(sessionResponse, redirectUrl);
        }

        throw error;
      }

      const {
        assignments: autoAssignments,
        scopeMissing: autoSyncScopeMissing,
      } = autoAssignmentsResult;

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

      console.log("[auth/callback] tribe memberships query", {
        count: memberships?.length ?? 0,
        error: membershipError?.message,
      });

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

  console.log("[auth/callback] SUCCESS: redirecting to", nextPath);
  const redirectUrl = new URL(nextPath, url.origin);
  return redirectWithSessionCookies(sessionResponse, redirectUrl);
}
