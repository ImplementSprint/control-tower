import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { getAuthenticatedAccessScope, type AccessScope } from "@/lib/auth/access";
import { formatDateTime, formatRuntime } from "@/lib/formatters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuditEvent, WorkflowJob, WorkflowRun } from "@/lib/supabase/types";

type RunDetailPageProps = {
  params: Promise<{ id: string }>;
};

type RunDetailResult = {
  run: WorkflowRun | null;
  jobs: WorkflowJob[];
  events: AuditEvent[];
  error: string | null;
  missing: boolean;
};

export const dynamic = "force-dynamic";

function canAccessTribe(scope: AccessScope, tribe: string | null) {
  if (scope.isPlatformAdmin) {
    return true;
  }

  if (!tribe) {
    return false;
  }

  return scope.tribes.includes(tribe.toLowerCase());
}

function getRunActionHint(run: WorkflowRun) {
  if (run.status === "failed") {
    return "Inspect failed jobs and logs before retrying.";
  }

  if (run.status === "running") {
    return "Monitor active jobs and wait for completion.";
  }

  if (run.status === "queued") {
    return "Run is queued and waiting for runner capacity.";
  }

  if (run.github_conclusion === "cancelled") {
    return "Run was cancelled. Verify if cancellation was expected.";
  }

  return "Run completed successfully. Review artifacts and promotion readiness.";
}

async function getRunDetails(scope: AccessScope, id: string): Promise<RunDetailResult> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: runData, error: runError } = await supabase
      .from("workflow_runs")
      .select(
        "id, repository, run_id, run_attempt, workflow_name, branch, environment, tribe, status, github_status, github_conclusion, event_name, action, run_url, commit_sha, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (runError) {
      return {
        run: null,
        jobs: [],
        events: [],
        error: "Unable to load run details.",
        missing: false,
      };
    }

    if (!runData) {
      return {
        run: null,
        jobs: [],
        events: [],
        error: null,
        missing: true,
      };
    }

    const run = runData as WorkflowRun;

    if (!canAccessTribe(scope, run.tribe)) {
      return {
        run: null,
        jobs: [],
        events: [],
        error: null,
        missing: true,
      };
    }

    let jobsQuery = supabase
      .from("workflow_jobs")
      .select(
        "id, repository, run_id, run_attempt, job_id, name, tribe, branch, environment, status, github_status, github_conclusion, run_url, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .eq("repository", run.repository)
      .eq("run_id", run.run_id)
      .eq("run_attempt", run.run_attempt)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!scope.isPlatformAdmin) {
      jobsQuery = jobsQuery.in("tribe", scope.tribes);
    }

    const { data: jobsData, error: jobsError } = await jobsQuery;

    if (jobsError) {
      return {
        run,
        jobs: [],
        events: [],
        error: "Run loaded, but jobs could not be retrieved.",
        missing: false,
      };
    }

    let eventsQuery = supabase
      .from("audit_events")
      .select(
        "id, event_type, source, actor, actor_type, repository, tribe, branch, environment, deployment_id, run_id, run_attempt, details, created_at",
      )
      .eq("repository", run.repository)
      .eq("run_id", run.run_id)
      .eq("run_attempt", run.run_attempt)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!scope.isPlatformAdmin) {
      eventsQuery = eventsQuery.in("tribe", scope.tribes);
    }

    const { data: eventsData } = await eventsQuery;

    return {
      run,
      jobs: (jobsData ?? []) as WorkflowJob[],
      events: (eventsData ?? []) as AuditEvent[],
      error: null,
      missing: false,
    };
  } catch (error) {
    return {
      run: null,
      jobs: [],
      events: [],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while loading run details.",
      missing: false,
    };
  }
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { id } = await params;
  const scope = await getAuthenticatedAccessScope();

  if (!scope) {
    redirect(`/auth/login?next=/runs/${id}`);
  }

  const { run, jobs, events, error, missing } = await getRunDetails(scope, id);

  if (missing) {
    notFound();
  }

  if (!run) {
    return (
      <main className="mx-auto w-full max-w-[960px] px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="destructive">
          <AlertTitle>Run details are unavailable</AlertTitle>
          <AlertDescription>
            {error ?? "Unexpected error while loading this run."}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-24 -top-20 h-80 w-80 rounded-full bg-[oklch(0.93_0.045_52_/_0.85)] blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <main className="relative mx-auto w-full max-w-[1080px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link href="/?tab=runs" className="hover:text-foreground">
                Dashboard
              </Link>
              <span>/</span>
              <Link href="/runs" className="hover:text-foreground">
                Runs
              </Link>
              <span>/</span>
              <span className="text-foreground">run #{run.run_id}</span>
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
              {run.workflow_name ?? "Workflow Run"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {run.repository} · attempt {run.run_attempt}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            {run.run_url ? (
              <a
                href={run.run_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Open in GitHub
              </a>
            ) : null}
          </div>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Partial data loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Run Summary</CardTitle>
            <CardDescription>{getRunActionHint(run)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 lg:grid-cols-3">
            <p>
              Branch: <span className="font-medium text-foreground">{run.branch}</span>
            </p>
            <p>
              Environment: <span className="font-medium text-foreground">{run.environment}</span>
            </p>
            <p>
              Tribe: <span className="font-medium text-foreground">{run.tribe}</span>
            </p>
            <p>
              GitHub status: <span className="font-medium text-foreground">{run.github_status ?? "-"}</span>
            </p>
            <p>
              Conclusion: <span className="font-medium text-foreground">{run.github_conclusion ?? "-"}</span>
            </p>
            <p>
              Runtime: <span className="font-medium text-foreground">{formatRuntime(run.duration_seconds)}</span>
            </p>
            <p>
              Started: <span className="font-medium text-foreground">{formatDateTime(run.started_at)}</span>
            </p>
            <p>
              Completed: <span className="font-medium text-foreground">{formatDateTime(run.completed_at)}</span>
            </p>
            <p>
              Commit: <span className="font-medium text-foreground">{run.commit_sha ?? "-"}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Jobs ({jobs.length})</CardTitle>
            <CardDescription>Job-level gate telemetry for this run</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-background/65 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Runtime</th>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Completed</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        No jobs captured yet for this run.
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => (
                      <tr
                        key={job.id}
                        className="border-b border-border/60 last:border-b-0 hover:bg-background/50"
                      >
                        <td className="px-4 py-3.5 font-medium text-foreground">{job.name}</td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {formatRuntime(job.duration_seconds)}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {formatDateTime(job.started_at)}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {formatDateTime(job.completed_at)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/jobs/${job.id}`}
                              className="inline-flex rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              Open
                            </Link>
                            {job.run_url ? (
                              <a
                                href={job.run_url}
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

        <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Audit Events ({events.length})</CardTitle>
            <CardDescription>Governance and ingestion events tied to this run</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {events.length === 0 ? (
              <p>No audit events matched this run.</p>
            ) : (
              events.map((eventItem) => (
                <div
                  key={eventItem.id}
                  className="rounded-xl border border-border/70 bg-background px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{eventItem.event_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(eventItem.created_at)}
                    </p>
                  </div>
                  <p className="text-xs">
                    source: {eventItem.source} · actor: {eventItem.actor ?? "system"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
