import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type SupabaseRouteContext = {
  supabase: ReturnType<typeof createServerClient>;
  sessionResponse: NextResponse;
};

function resolveSafeNextPath(rawNext: string | null) {
  if (!rawNext) {
    return "/";
  }

  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) {
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
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
  }

  return redirectResponse;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = resolveSafeNextPath(url.searchParams.get("next"));

  if (!code) {
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "missing_oauth_code");
    return NextResponse.redirect(redirectUrl);
  }

  const { supabase, sessionResponse } = await createSupabaseRouteContext();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "oauth_exchange_failed");
    return redirectWithSessionCookies(sessionResponse, redirectUrl);
  }

  const requiredOrgs = (process.env.GITHUB_ALLOWED_ORG ?? "")
    .split(",")
    .map((org) => org.trim())
    .filter((org) => org.length > 0);

  const explicitEnforceToggle =
    (process.env.GITHUB_REQUIRE_ORG_MEMBERSHIP ?? "false").trim().toLowerCase() ===
    "true";

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

  const redirectUrl = new URL(nextPath, url.origin);
  return redirectWithSessionCookies(sessionResponse, redirectUrl);
}
