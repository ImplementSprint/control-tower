"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
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

const floatingLeftNotes = [
  { text: "Review failed runs", top: "8%", rotate: -10 },
  { text: "Verify release gates", top: "25%", rotate: -7 },
  { text: "Check policy alerts", top: "42%", rotate: -11 },
  { text: "Track uat stability", top: "60%", rotate: -8 },
  { text: "Confirm promotion", top: "77%", rotate: -12 },
];

const floatingRightNotes = [
  { text: "Ship mobile build", top: "12%", rotate: 9 },
  { text: "Sync with cicd tribe", top: "30%", rotate: 7 },
  { text: "Audit workflow jobs", top: "48%", rotate: 10 },
  { text: "Monitor test branch", top: "66%", rotate: 8 },
  { text: "Close release brief", top: "83%", rotate: 11 },
];

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

  if (value.startsWith("/auth/login") || value.startsWith("/auth/callback")) {
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
    <main className="relative min-h-screen overflow-hidden bg-[#ececef] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-52 lg:block">
        {floatingLeftNotes.map((note) => (
          <div
            key={note.text}
            className="absolute left-[-3.2rem] rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-500 shadow-sm"
            style={{ top: note.top, transform: `rotate(${note.rotate}deg)` }}
          >
            {note.text}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-52 lg:block">
        {floatingRightNotes.map((note) => (
          <div
            key={note.text}
            className="absolute right-[-3.2rem] rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-500 shadow-sm"
            style={{ top: note.top, transform: `rotate(${note.rotate}deg)` }}
          >
            {note.text}
          </div>
        ))}
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl items-center justify-center">
        <section className="w-full max-w-md text-center">
          <div className="mx-auto inline-grid size-10 grid-cols-2 gap-1.5">
            <span className="rounded-md bg-zinc-900" />
            <span className="rounded-md bg-zinc-900" />
            <span className="rounded-md bg-zinc-900" />
            <span className="rounded-md bg-zinc-900" />
          </div>

          <h1 className="mt-7 text-balance font-heading text-4xl font-semibold leading-tight text-slate-600 sm:text-5xl">
            Joyful and productive
            <br />
            collaboration.
            <span className="text-slate-900"> All in one.</span>
          </h1>

          <div className="mx-auto mt-8 w-full max-w-sm space-y-3" aria-live="polite">
            {incomingError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-sm text-rose-700">
                {errorMessages[incomingError] ?? "Authentication failed."}
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-sm text-rose-700">
                {error}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            className="mx-auto mt-3 flex h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-zinc-800 text-sm font-medium text-white shadow-sm hover:bg-zinc-700"
            disabled={isLoading}
            onClick={handleGitHubLogin}
          >
            <span className="inline-flex size-4 items-center justify-center rounded-full border border-white/40 text-[10px] font-semibold leading-none">
              G
            </span>
            {isLoading ? "Redirecting to GitHub..." : "Continue with GitHub"}
          </Button>

          <p className="mx-auto mt-3 max-w-sm text-center text-[11px] leading-relaxed text-slate-500">
            By continuing, you acknowledge the Control Tower access policy and
            security requirements.
          </p>

          <p className="mx-auto mt-2 max-w-sm text-center text-[11px] text-slate-500">
            {allowedOrgHint
              ? `Restricted to ${allowedOrgHint} organization members with authorized platform access.`
              : "Access is managed by platform admins through tribe membership."}
          </p>

          {enforceOrgPolicy ? (
            <p className="mx-auto mt-2 max-w-sm text-center text-[11px] text-amber-700">
              Org policy is enabled and this login requests read:org for membership verification.
            </p>
          ) : null}
        </section>
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
