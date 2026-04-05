"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[error-boundary]", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-[oklch(0.94_0.06_54_/_0.8)] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-12 h-80 w-80 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <div className="relative mx-auto w-full max-w-xl">
        <Card className="w-full rounded-[28px] border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background text-rose-600">
              <AlertTriangle className="size-6" />
            </div>
            <CardTitle className="font-heading text-3xl font-semibold tracking-tight">
              Something went wrong
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. You can try again or return to the dashboard.
            </p>
          </CardHeader>

          <CardContent className="space-y-4 pb-6">
            {error.digest && (
              <p className="text-center font-mono text-xs text-muted-foreground">
                Error ID: {error.digest}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Back to Dashboard
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
