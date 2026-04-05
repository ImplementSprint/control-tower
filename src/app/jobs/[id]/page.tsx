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
import type { WorkflowJob, WorkflowRun } from "@/lib/supabase/types";

type JobDetailPageProps = {
  params: Promise<{ id: string }>;
};

type JobDetailResult = {
  job: WorkflowJob | null;
  run: WorkflowRun | null;
  siblingJobs: WorkflowJob[];
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

function getJobActionHint(job: WorkflowJob) {
  if (job.status === "failed") {
    return "Investigate failing step logs and rerun strategy.";
  }

  if (job.status === "running") {
    return "Monitor progress and downstream gate dependencies.";
  }

  if (job.status === "queued") {
    return "Queued for execution. Wait for runner availability.";
  }

  if (job.github_conclusion === "cancelled") {
    return "Confirm whether cancellation was expected.";
  }

  return "Job completed successfully.";
}

async function getJobDetails(scope: AccessScope, id: string): Promise<JobDetailResult> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: jobData, error: jobError } = await supabase
      .from("workflow_jobs")
      .select(
        "id, repository, run_id, run_attempt, job_id, name, tribe, branch, environment, status, github_status, github_conclusion, run_url, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (jobError) {
      return {
        job: null,
        run: null,
        siblingJobs: [],
        error: "Unable to load job details.",
        missing: false,
      };
    }

    if (!jobData) {
      return {
        job: null,
        run: null,
        siblingJobs: [],
        error: null,
        missing: true,
      };
    }

    const job = jobData as WorkflowJob;

    if (!canAccessTribe(scope, job.tribe)) {
      return {
        job: null,
        run: null,
        siblingJobs: [],
        error: null,
        missing: true,
      };
    }

    let runQuery = supabase
      .from("workflow_runs")
      .select(
        "id, repository, run_id, run_attempt, workflow_name, branch, environment, tribe, status, github_status, github_conclusion, event_name, action, run_url, commit_sha, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .eq("repository", job.repository)
      .eq("run_id", job.run_id)
      .eq("run_attempt", job.run_attempt);

    if (!scope.isPlatformAdmin) {
      runQuery = runQuery.in("tribe", scope.tribes);
    }

    const { data: runData } = await runQuery.maybeSingle();

    let siblingsQuery = supabase
      .from("workflow_jobs")
      .select(
        "id, repository, run_id, run_attempt, job_id, name, tribe, branch, environment, status, github_status, github_conclusion, run_url, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .eq("repository", job.repository)
      .eq("run_id", job.run_id)
      .eq("run_attempt", job.run_attempt)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!scope.isPlatformAdmin) {
      siblingsQuery = siblingsQuery.in("tribe", scope.tribes);
    }

    const { data: siblingsData, error: siblingsError } = await siblingsQuery;

    if (siblingsError) {
      return {
        job,
        run: (runData as WorkflowRun | null) ?? null,
        siblingJobs: [],
        error: "Job loaded, but sibling jobs could not be retrieved.",
        missing: false,
      };
    }

    return {
      job,
      run: (runData as WorkflowRun | null) ?? null,
      siblingJobs: (siblingsData ?? []) as WorkflowJob[],
      error: null,
      missing: false,
    };
  } catch (error) {
    return {
      job: null,
      run: null,
      siblingJobs: [],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while loading job details.",
      missing: false,
    };
  }
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;
  const scope = await getAuthenticatedAccessScope();

  if (!scope) {
    redirect(`/auth/login?next=/jobs/${id}`);
  }

  const { job, run, siblingJobs, error, missing } = await getJobDetails(scope, id);

  if (missing) {
    notFound();
  }

  if (!job) {
    return (
      <main className="mx-auto w-full max-w-[960px] px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="destructive">
          <AlertTitle>Job details are unavailable</AlertTitle>
          <AlertDescription>
            {error ?? "Unexpected error while loading this job."}
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
              {run ? (
                <Link href={`/runs/${run.id}`} className="hover:text-foreground">
                  run #{run.run_id}
                </Link>
              ) : (
                <span>run</span>
              )}
              <span>/</span>
              <span className="text-foreground">job #{job.job_id}</span>
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
              {job.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {job.repository} · run #{job.run_id} · attempt {job.run_attempt}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            {job.run_url ? (
              <a
                href={job.run_url}
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
            <CardTitle className="text-lg">Job Summary</CardTitle>
            <CardDescription>{getJobActionHint(job)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 lg:grid-cols-3">
            <p>
              Branch: <span className="font-medium text-foreground">{job.branch}</span>
            </p>
            <p>
              Environment: <span className="font-medium text-foreground">{job.environment}</span>
            </p>
            <p>
              Tribe: <span className="font-medium text-foreground">{job.tribe}</span>
            </p>
            <p>
              GitHub status: <span className="font-medium text-foreground">{job.github_status ?? "-"}</span>
            </p>
            <p>
              Conclusion: <span className="font-medium text-foreground">{job.github_conclusion ?? "-"}</span>
            </p>
            <p>
              Runtime: <span className="font-medium text-foreground">{formatRuntime(job.duration_seconds)}</span>
            </p>
            <p>
              Started: <span className="font-medium text-foreground">{formatDateTime(job.started_at)}</span>
            </p>
            <p>
              Completed: <span className="font-medium text-foreground">{formatDateTime(job.completed_at)}</span>
            </p>
            <p>
              Linked run: <span className="font-medium text-foreground">#{job.run_id}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Sibling Jobs ({siblingJobs.length})</CardTitle>
            <CardDescription>Other jobs from this same run attempt</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {siblingJobs.length === 0 ? (
              <p>No sibling jobs were found for this run.</p>
            ) : (
              siblingJobs.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2"
                >
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      runtime {formatRuntime(item.duration_seconds)} · updated {formatDateTime(item.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.id === job.id ? (
                      <span className="inline-flex rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground">
                        Current
                      </span>
                    ) : (
                      <Link
                        href={`/jobs/${item.id}`}
                        className="inline-flex rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
