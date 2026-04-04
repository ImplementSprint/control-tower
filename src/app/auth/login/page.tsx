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

type SideNote = {
  text: string;
  time: string;
  top: string;
  rotate: number;
  done?: boolean;
};

const floatingLeftNotes = [
  { text: "Review failed runs", time: "18:00", top: "6%", rotate: -11, done: true },
  { text: "Verify release gates", time: "14:30", top: "23%", rotate: -8 },
  { text: "Check policy alerts", time: "10:00", top: "40%", rotate: -10 },
  { text: "Track uat stability", time: "16:00", top: "57%", rotate: -9, done: true },
  { text: "Confirm promotion", time: "20:00", top: "74%", rotate: -12 },
  { text: "Close incident brief", time: "08:00", top: "91%", rotate: -7 },
] satisfies SideNote[];

const floatingRightNotes = [
  { text: "Ship mobile build", time: "20:00", top: "11%", rotate: 9 },
  { text: "Sync with cicd tribe", time: "11:00", top: "28%", rotate: 7, done: true },
  { text: "Audit workflow jobs", time: "22:00", top: "45%", rotate: 10 },
  { text: "Monitor test branch", time: "18:00", top: "62%", rotate: 8 },
  { text: "Close release brief", time: "08:00", top: "79%", rotate: 11, done: true },
  { text: "Prep next rollout", time: "07:30", top: "94%", rotate: 8 },
] satisfies SideNote[];

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
            className="absolute left-[-5.8rem] min-w-[170px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-500 shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
            style={{ top: note.top, transform: `rotate(${note.rotate}deg)` }}
          >
            <div className="flex items-start gap-2">
              <span className="mt-[2px] inline-flex size-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px] leading-none text-slate-500">
                {note.done ? "v" : ""}
              </span>
              <div>
                <p className="text-[11px] font-medium leading-4 text-slate-600">{note.text}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{note.time}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-52 lg:block">
        {floatingRightNotes.map((note) => (
          <div
            key={note.text}
            className="absolute right-[-5.8rem] min-w-[170px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-500 shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
            style={{ top: note.top, transform: `rotate(${note.rotate}deg)` }}
          >
            <div className="flex items-start gap-2">
              <span className="mt-[2px] inline-flex size-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px] leading-none text-slate-500">
                {note.done ? "v" : ""}
              </span>
              <div>
                <p className="text-[11px] font-medium leading-4 text-slate-600">{note.text}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{note.time}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl items-center justify-center">
        <section className="w-full max-w-[620px] text-center">
          <div className="mx-auto inline-grid size-9 grid-cols-2 gap-1.5">
            <span className="rounded-md bg-zinc-900" />
            <span className="rounded-md bg-zinc-900" />
            <span className="rounded-md bg-zinc-900" />
            <span className="rounded-md bg-zinc-900" />
          </div>

          <h1 className="mx-auto mt-7 max-w-[560px] text-balance font-heading text-[clamp(1.85rem,4vw,3.1rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-slate-600">
            Joyful and productive collaboration.
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
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="size-4 fill-current text-white"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.1 0 0 .67-.21 2.2.82a7.62 7.62 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.09.16 1.9.08 2.1.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            {isLoading ? "Redirecting to GitHub..." : "Continue with GitHub"}
          </Button>

          <p className="mx-auto mt-3 max-w-sm text-center text-[11px] leading-relaxed text-slate-500">
            By continuing, you acknowledge the Control Tower access policy and
            security requirements.
          </p>

          {enforceOrgPolicy && allowedOrgHint ? (
            <p className="mx-auto mt-2 max-w-sm text-center text-[11px] text-slate-500">
              Restricted to {allowedOrgHint} organization members.
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
