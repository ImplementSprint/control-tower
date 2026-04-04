"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const errorMessages: Record<string, string> = {
  missing_oauth_code: "GitHub sign-in did not return an authorization code.",
  oauth_exchange_failed: "Could not finalize GitHub login. Try again.",
  github_scope_missing: "GitHub org verification scope is missing. Contact an admin.",
  org_membership_required: "Access is restricted to ImplementSprint organization members.",
  org_check_failed: "GitHub org verification failed. Please try again.",
};

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
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

  async function handleGitHubLogin() {
    setError(null);
    setIsLoading(true);

    try {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", nextPath);

      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: redirectTo.toString(),
          scopes: "read:org user:email",
        },
      });

      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
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
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-md items-center">
        <Card className="w-full border-border/80 bg-card shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="font-heading text-3xl font-semibold tracking-tight">
              Sign in to Control Tower
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Access is limited to ImplementSprint GitHub organization members.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
              className="w-full"
              disabled={isLoading}
              onClick={handleGitHubLogin}
            >
              {isLoading ? "Redirecting to GitHub..." : "Continue with GitHub"}
            </Button>
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
