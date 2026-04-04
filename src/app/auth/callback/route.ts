import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = resolveSafeNextPath(url.searchParams.get("next"));

  if (!code) {
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "missing_oauth_code");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const redirectUrl = new URL("/auth/login", url.origin);
    redirectUrl.searchParams.set("error", "oauth_exchange_failed");
    return NextResponse.redirect(redirectUrl);
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
    return NextResponse.redirect(redirectUrl);
  }

  if (enforceOrgPolicy && requiredOrgs.length > 0) {
    const providerToken = data.session.provider_token;

    if (!providerToken) {
      await supabase.auth.signOut();
      const redirectUrl = new URL("/auth/login", url.origin);
      redirectUrl.searchParams.set("error", "github_scope_missing");
      return NextResponse.redirect(redirectUrl);
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
        return NextResponse.redirect(redirectUrl);
      }
    } catch {
      await supabase.auth.signOut();
      const redirectUrl = new URL("/auth/login", url.origin);
      redirectUrl.searchParams.set("error", "org_check_failed");
      return NextResponse.redirect(redirectUrl);
    }
  }

  const redirectUrl = new URL(nextPath, url.origin);
  return NextResponse.redirect(redirectUrl);
}
