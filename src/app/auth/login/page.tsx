"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const errorMessages: Record<string, string> = {
  missing_oauth_code: "GitHub sign-in did not return an authorization code.",
  oauth_exchange_failed: "Could not finalize GitHub login. Try again.",
  org_policy_misconfigured:
    "Organization policy enforcement is enabled but no allowed orgs are configured. Set GITHUB_ALLOWED_ORG on the server.",
  github_scope_missing:
    "GitHub authorization is missing required scope for org policy checks. Include read:org only when org enforcement is intentionally enabled.",
  org_membership_required:
    "Access is restricted by organization membership policy for this deployment.",
  org_check_failed: "GitHub org verification failed. Please try again.",
  provider_not_enabled:
    "GitHub OAuth is not enabled in Supabase yet. Enable GitHub provider in Supabase Auth -> Providers, configure Client ID/Secret, and ensure your app callback URL is in Supabase redirect allow-list.",
};

const configuredOauthScopes =
  process.env.NEXT_PUBLIC_GITHUB_OAUTH_SCOPES?.trim() || "user:email";

const explicitEnforceOrgPolicy =
  process.env.NEXT_PUBLIC_GITHUB_REQUIRE_ORG_MEMBERSHIP?.trim().toLowerCase() ===
  "true";

const configuredAllowedOrgHint =
  process.env.NEXT_PUBLIC_GITHUB_ALLOWED_ORG?.trim() || "";

const enforceOrgPolicy =
  explicitEnforceOrgPolicy || configuredAllowedOrgHint.length > 0;

const allowedOrgHint = enforceOrgPolicy ? configuredAllowedOrgHint : "";

function normalizeScopeString(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    ),
  ).join(" ");
}

function ensureOrgScope(value: string) {
  const scopes = normalizeScopeString(value)
    .split(" ")
    .filter((scope) => scope.length > 0);

  if (!scopes.includes("read:org")) {
    scopes.push("read:org");
  }

  return scopes.join(" ");
}

function buildRequestedScopes() {
  const normalized = normalizeScopeString(configuredOauthScopes)
    .split(" ")
    .filter((scope) => scope.length > 0);

  const baseScopes = normalized.filter(
    (scope) => scope !== "read:org" && scope !== "read:user",
  );

  if (!baseScopes.includes("user:email")) {
    baseScopes.push("user:email");
  }

  if (enforceOrgPolicy) {
    return ensureOrgScope(baseScopes.join(" "));
  }

  return baseScopes.join(" ");
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function mapOAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("unsupported provider") ||
    normalized.includes("provider is not enabled")
  ) {
    return errorMessages.provider_not_enabled;
  }

  return message;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incomingError = searchParams.get("error");
  const nextPath = useMemo(
    () => getSafeNextPath(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLoading(false);
      setError(
        "GitHub sign-in did not complete in time. Retry and ensure popups/redirects are allowed in this browser.",
      );
    }, 12000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLoading]);

  async function handleGitHubLogin() {
    setError(null);
    setIsLoading(true);

    try {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", nextPath);

      const requestedScopes =
        incomingError === "github_scope_missing"
          ? ensureOrgScope(buildRequestedScopes())
          : buildRequestedScopes();

      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: redirectTo.toString(),
          scopes: requestedScopes,
        },
      });

      if (signInError) {
        setError(mapOAuthError(signInError.message));
        setIsLoading(false);
        return;
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unexpected login error.",
      );
      setIsLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-[oklch(0.94_0.06_54_/_0.8)] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-12 h-80 w-80 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden rounded-[28px] border border-border/70 bg-card/95 p-8 shadow-sm lg:block">
          <div className="inline-flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background">
            <ShieldCheck className="size-6 text-foreground" />
          </div>
          <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight text-foreground">
            Control Tower
          </h1>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Centralized CI/CD visibility with tribe-scoped access and governance controls.
          </p>
          <div className="mt-8 space-y-3 text-sm text-muted-foreground">
            <p className="rounded-xl border border-border/70 bg-background px-3 py-2">
              View-only by default for tribe members.
            </p>
            <p className="rounded-xl border border-border/70 bg-background px-3 py-2">
              Optional GitHub org policy enforcement on sign-in.
            </p>
            <p className="rounded-xl border border-border/70 bg-background px-3 py-2">
              Audited admin overrides for controlled operations.
            </p>
          </div>
        </section>

        <Card className="w-full rounded-[28px] border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background">
              <ShieldCheck className="size-6 text-foreground" />
            </div>
            <CardTitle className="font-heading text-3xl font-semibold tracking-tight">
              Sign in
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {allowedOrgHint
                ? `Access is limited to ${allowedOrgHint} members and authorized platform users.`
                : "Access is controlled by platform admins via tribe membership assignments."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            {incomingError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {errorMessages[incomingError] ?? "Authentication failed."}
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              className="h-10 w-full"
              disabled={isLoading}
              onClick={handleGitHubLogin}
            >
              {isLoading ? "Redirecting to GitHub..." : "Continue with GitHub"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Need access? Ask a platform admin to assign your tribe membership.
            </p>

            {enforceOrgPolicy ? (
              <p className="text-center text-xs text-amber-700">
                Org policy is enabled. This sign-in can request read:org for membership validation.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
