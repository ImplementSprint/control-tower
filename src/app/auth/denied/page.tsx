import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DeniedPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type DeniedReason =
  | "tribe_membership_required"
  | "membership_table_unavailable"
  | "membership_check_failed"
  | "unknown";

export const dynamic = "force-dynamic";

const reasonMessages: Record<DeniedReason, { title: string; description: string }> = {
  tribe_membership_required: {
    title: "Access Provisioning Required",
    description:
      "You are authenticated, but your account has no active tribe membership yet. Ask a platform admin to add your user to user_tribe_membership.",
  },
  membership_table_unavailable: {
    title: "Access Configuration Unavailable",
    description:
      "Control Tower could not read access memberships right now. This is usually a database setup or permission issue. Contact a platform admin.",
  },
  membership_check_failed: {
    title: "Access Verification Failed",
    description:
      "Control Tower could not verify your access due to a transient backend error. Try again in a moment.",
  },
  unknown: {
    title: "Access Denied",
    description:
      "Your request could not be authorized for this Control Tower deployment.",
  },
};

function getSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizeReason(value: string | undefined): DeniedReason {
  if (
    value === "tribe_membership_required" ||
    value === "membership_table_unavailable" ||
    value === "membership_check_failed"
  ) {
    return value;
  }

  return "unknown";
}

function getSafeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  if (value.startsWith("/auth/login") || value.startsWith("/auth/callback")) {
    return "/";
  }

  return value;
}

export default async function AccessDeniedPage({ searchParams }: DeniedPageProps) {
  const resolvedSearchParams = await searchParams;
  const reason = normalizeReason(getSingleParam(resolvedSearchParams.reason));
  const nextPath = getSafeNextPath(getSingleParam(resolvedSearchParams.next));
  const message = reasonMessages[reason];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-[oklch(0.94_0.06_54_/_0.8)] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-12 h-80 w-80 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <div className="relative mx-auto w-full max-w-xl">
        <Card className="w-full rounded-[28px] border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background text-amber-700">
              <AlertTriangle className="size-6" />
            </div>
            <CardTitle className="font-heading text-3xl font-semibold tracking-tight">
              {message.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{message.description}</p>
          </CardHeader>

          <CardContent className="space-y-4 pb-6">
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href={`/auth/login?next=${encodeURIComponent(nextPath)}`}
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Retry GitHub Sign-In
              </Link>

              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Sign Out
                </button>
              </form>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              If this persists, verify your org policy settings and user tribe membership configuration.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
