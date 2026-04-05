import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  getAuthenticatedAccessScope,
  getScopedTribes,
  type AccessScope,
} from "@/lib/auth/access";
import { formatRelativeTime, formatRuntime } from "@/lib/formatters";
import { getSingleParam } from "@/lib/query-params";
import type { DeploymentStatus, WorkflowRun } from "@/lib/supabase/types";
import { getScopedWorkflowRuns } from "@/lib/dashboard/query-cache";

type RunsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type StatusFilter = "all" | DeploymentStatus;

export const revalidate = 120;

const statusLabel: Record<StatusFilter, string> = {
  all: "All",
  queued: "Queued",
  running: "Running",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
};

function normalizeStatusFilter(value: string | undefined): StatusFilter {
  if (
    value === "queued" ||
    value === "running" ||
    value === "success" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "all";
}

function buildRunsHref(status: StatusFilter) {
  if (status === "all") {
    return "/runs";
  }

  return `/runs?status=${status}`;
}

async function getRuns(scope: AccessScope, status: StatusFilter) {
  try {
    const scopedTribes = getScopedTribes(scope, null);

    if (scopedTribes !== null && scopedTribes.length === 0) {
      return {
        runs: [] as WorkflowRun[],
        error: null,
      };
    }

    const effectiveScope =
      scopedTribes === null
        ? scope
        : {
            ...scope,
            isPlatformAdmin: false,
            tribes: scopedTribes,
          };

    const runs = await getScopedWorkflowRuns(effectiveScope, {
      status,
      limit: 60,
    });

    return {
      runs,
      error: null,
    };
  } catch (error) {
    return {
      runs: [] as WorkflowRun[],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while loading workflow runs.",
    };
  }
}

export default async function RunsPage({ searchParams }: RunsPageProps) {
  const scope = await getAuthenticatedAccessScope();

  if (!scope) {
    redirect("/auth/login?next=/runs");
  }

  const resolvedSearchParams = await searchParams;
  const statusFilter = normalizeStatusFilter(
    getSingleParam(resolvedSearchParams.status),
  );

  const { runs, error } = await getRuns(scope, statusFilter);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-24 -top-20 h-80 w-80 rounded-full bg-[oklch(0.93_0.045_52_/_0.85)] blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <main className="relative mx-auto w-full max-w-[1180px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
              Runs Explorer
            </h1>
            <p className="text-sm text-muted-foreground">
              Full run history with drill-down into run and job detail pages.
            </p>
          </div>
          <Link
            href="/?tab=runs"
            className="inline-flex items-center rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back to Dashboard
          </Link>
        </header>

        <section className="flex flex-wrap gap-2">
          {(Object.keys(statusLabel) as StatusFilter[]).map((status) => (
            <Link
              key={status}
              href={buildRunsHref(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? "bg-foreground text-background"
                  : "border border-border/70 bg-card text-foreground hover:bg-muted"
              }`}
            >
              {statusLabel[status]}
            </Link>
          ))}
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Runs explorer is unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="rounded-[28px] border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Recent Workflow Runs</CardTitle>
            <CardDescription>
              Showing {runs.length} rows for status filter: {statusLabel[statusFilter]}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-background/65 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Repository</th>
                    <th className="px-4 py-3 font-medium">Workflow</th>
                    <th className="px-4 py-3 font-medium">Branch</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last Activity</th>
                    <th className="px-4 py-3 font-medium">Tribe</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No workflow runs are available for this filter.
                      </td>
                    </tr>
                  ) : (
                    runs.map((run) => (
                      <tr
                        key={run.id}
                        className="border-b border-border/60 last:border-b-0 hover:bg-background/50"
                      >
                        <td className="px-4 py-3.5 font-medium text-foreground">{run.repository}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{run.workflow_name ?? "Workflow"}</p>
                            <p className="text-xs text-muted-foreground">
                              run #{run.run_id} · attempt {run.run_attempt}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">{run.branch}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {formatRuntime(run.duration_seconds)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {formatRelativeTime(run.completed_at ?? run.created_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                            {run.tribe}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/runs/${run.id}`}
                              className="inline-flex rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              Open
                            </Link>
                            {run.run_url ? (
                              <a
                                href={run.run_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                              >
                                GitHub
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
