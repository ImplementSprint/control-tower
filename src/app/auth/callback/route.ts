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
import { resolveMembershipBootstrapConfig } from "@/lib/auth/membership-bootstrap";
import { isAllowedGithubOrgMember } from "@/lib/auth/github-membership";
import {
  redirectWithSessionCookies,
  resolveSafeNextPath,
} from "@/lib/auth/callback-response";
import { logEvent } from "@/lib/observability";

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

  logEvent("info", "auth.callback.started", { hasCode: !!code, nextPath });

  if (!code) {
    logEvent("warn", "auth.callback.failed", { reason: "missing_oauth_code" });
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "missing_oauth_code");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    logEvent("warn", "auth.callback.failed", { reason: "oauth_exchange_failed", error: error?.message });
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "oauth_exchange_failed");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  logEvent("info", "auth.callback.session_exchanged", {
    userId: data.user?.id?.slice(0, 8),
    hasProviderToken: !!data.session.provider_token,
  });

  const { requiredOrgs, enforceOrgPolicy } = resolveGitHubOrgPolicyConfig();

  logEvent("info", "auth.callback.org_policy", { enforceOrgPolicy, orgCount: requiredOrgs.length });

  if (enforceOrgPolicy && requiredOrgs.length === 0) {
    logEvent("warn", "auth.callback.failed", { reason: "org_policy_misconfigured" });
    await supabase.auth.signOut();
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "org_policy_misconfigured");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  if (enforceOrgPolicy && requiredOrgs.length > 0) {
    const providerToken = data.session.provider_token;

    if (!providerToken) {
      logEvent("warn", "auth.callback.failed", { reason: "github_scope_missing", detail: "no_provider_token" });
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
        logEvent("info", "auth.callback.org_check", { allowed: result.allowed, scopeMissing: result.scopeMissing });

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
        const reason = scopeMissing ? "github_scope_missing" : "org_membership_required";
        logEvent("warn", "auth.callback.failed", { reason });
        await supabase.auth.signOut();
        const redirectUrl = new URL("/auth/login", url.origin);
        redirectUrl.searchParams.set("error", reason);
        return redirectWithSessionCookies(sessionResponse, redirectUrl);
      }
    } catch (orgError) {
      logEvent("error", "auth.callback.failed", { reason: "org_check_failed", error: orgError instanceof Error ? orgError.message : "unknown" });
      await supabase.auth.signOut();
      const redirectUrl = new URL("/auth/login", url.origin);
      redirectUrl.searchParams.set("error", "org_check_failed");
      return redirectWithSessionCookies(sessionResponse, redirectUrl);
    }
  }

  logEvent("info", "auth.callback.org_policy_passed");

  const authenticatedUserId = data.user?.id ?? data.session.user?.id ?? null;

  if (authenticatedUserId) {
    try {
      const adminClient = createSupabaseAdminClient();
      let autoAssignmentsResult: Awaited<
        ReturnType<typeof resolveAutomaticMembershipAssignments>
      >;

      try {
        logEvent("info", "auth.callback.membership_sync_started");
        autoAssignmentsResult = await resolveAutomaticMembershipAssignments({
          user: (data.user ?? {
            email: data.session.user?.email ?? null,
          }) as AuthenticatedUserLike,
          providerToken: data.session.provider_token ?? null,
        });
        logEvent("info", "auth.callback.membership_sync_complete", {
          assignmentCount: autoAssignmentsResult.assignments.length,
          scopeMissing: autoAssignmentsResult.scopeMissing,
        });
      } catch (error) {
        const details = error instanceof Error ? error.message : "Unknown error";
        const isMembershipMapMisconfigured =
          details.includes("GITHUB_USER_TRIBE_ROLE_MAP_JSON") ||
          details.includes("GITHUB_TEAM_TRIBE_ROLE_MAP_JSON");

        if (isMembershipMapMisconfigured) {
          logEvent("warn", "auth.callback.failed", { reason: "membership_map_misconfigured" });
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
        logEvent("warn", "auth.callback.failed", { reason: "github_scope_missing", detail: "team_sync" });
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
          logEvent("error", "auth.callback.membership_upsert_failed", { error: upsertError.message });
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

      logEvent("info", "auth.callback.membership_check", {
        hasMembership: (memberships?.length ?? 0) > 0,
        queryError: !!membershipError,
      });

      if (membershipError) {
        logEvent("error", "auth.callback.membership_query_failed", { error: membershipError.message });
        const deniedUrl = new URL("/auth/denied", url.origin);
        deniedUrl.searchParams.set("reason", "membership_table_unavailable");
        deniedUrl.searchParams.set("next", nextPath);
        return redirectWithSessionCookies(sessionResponse, deniedUrl);
      }

      if (!memberships || memberships.length === 0) {
        const { isFirstUserBootstrapEnabled, bootstrapTribe } =
          resolveMembershipBootstrapConfig();

        if (isFirstUserBootstrapEnabled) {
          const {
            count: activeMembershipCount,
            error: activeMembershipCountError,
          } = await adminClient
            .from("user_tribe_membership")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true);

          if (activeMembershipCountError) {
            logEvent("error", "auth.callback.membership_count_failed", {
              error: activeMembershipCountError.message,
            });
            const deniedUrl = new URL("/auth/denied", url.origin);
            deniedUrl.searchParams.set("reason", "membership_table_unavailable");
            deniedUrl.searchParams.set("next", nextPath);
            return redirectWithSessionCookies(sessionResponse, deniedUrl);
          }

          if ((activeMembershipCount ?? 0) === 0) {
            const { error: bootstrapUpsertError } = await adminClient
              .from("user_tribe_membership")
              .upsert(
                [
                  {
                    user_id: authenticatedUserId,
                    tribe: bootstrapTribe,
                    role: "platform_admin",
                    is_active: true,
                  },
                ],
                { onConflict: "user_id,tribe" },
              );

            if (bootstrapUpsertError) {
              logEvent("error", "auth.callback.bootstrap_membership_failed", {
                error: bootstrapUpsertError.message,
              });
              const deniedUrl = new URL("/auth/denied", url.origin);
              deniedUrl.searchParams.set("reason", "membership_check_failed");
              deniedUrl.searchParams.set("next", nextPath);
              return redirectWithSessionCookies(sessionResponse, deniedUrl);
            }

            logEvent("info", "auth.callback.bootstrap_membership_created", {
              tribe: bootstrapTribe,
            });
            const redirectUrl = new URL(nextPath, url.origin);
            return redirectWithSessionCookies(sessionResponse, redirectUrl);
          }
        }

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
          logEvent("info", "auth.callback.metadata_fallback_access_granted");
          const redirectUrl = new URL(nextPath, url.origin);
          return redirectWithSessionCookies(sessionResponse, redirectUrl);
        }

        logEvent("warn", "auth.callback.access_denied", { reason: "tribe_membership_required" });
        const deniedUrl = new URL("/auth/denied", url.origin);
        deniedUrl.searchParams.set("reason", "tribe_membership_required");
        deniedUrl.searchParams.set("next", nextPath);
        return redirectWithSessionCookies(sessionResponse, deniedUrl);
      }
    } catch {
      logEvent("error", "auth.callback.unexpected_error");
      const deniedUrl = new URL("/auth/denied", url.origin);
      deniedUrl.searchParams.set("reason", "membership_check_failed");
      deniedUrl.searchParams.set("next", nextPath);
      return redirectWithSessionCookies(sessionResponse, deniedUrl);
    }
  }

  logEvent("info", "auth.callback.success", { nextPath });
  const redirectUrl = new URL(nextPath, url.origin);
  return redirectWithSessionCookies(sessionResponse, redirectUrl);
}
