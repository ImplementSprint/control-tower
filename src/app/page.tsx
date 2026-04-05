import { LayoutDashboard } from "lucide-react";
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
  type AccessScope,
} from "@/lib/auth/access";
import { formatRelativeTime, formatRuntime } from "@/lib/formatters";
import { getSingleParam } from "@/lib/query-params";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Deployment,
  WorkflowRun,
} from "@/lib/supabase/types";
import {
  filterDeployments,
  filterWorkflowRuns,
  getDeploymentMetrics as getMetrics,
  getDeploymentNextAction as getNextAction,
  getReliabilityBand,
  getRiskTone,
  getRunNextAction,
  type FocusFilter,
} from "@/lib/dashboard/home-presenters";

type TribeHealthRow = {
  tribe: string;
  totalRuns: number;
  successRate: number;
  failedRuns: number;
  runningRuns: number;
  averageDurationSeconds: number;
};

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type DashboardTab = "summary" | "runs" | "metrics";

export const dynamic = "force-dynamic";

const tabLabels: Record<DashboardTab, string> = {
  summary: "Summary",
  runs: "Runs",
  metrics: "Metrics",
};

const focusLabels: Record<FocusFilter, string> = {
  all: "All Runs",
  new: "New Runs",
  "high-priority": "High Priority",
  "at-risk": "At Risk",
  "closing-soon": "Closing Soon",
};

function normalizeTab(value: string | undefined): DashboardTab {
  if (value === "runs" || value === "metrics") {
    return value;
  }

  return "summary";
}

function normalizeFocusFilter(value: string | undefined): FocusFilter {
  if (
    value === "new" ||
    value === "high-priority" ||
    value === "at-risk" ||
    value === "closing-soon"
  ) {
    return value;
  }

  return "all";
}

function buildDashboardHref(tab: DashboardTab, focus: FocusFilter) {
  const query = new URLSearchParams();

  if (tab !== "summary") {
    query.set("tab", tab);
  }

  if (focus !== "all") {
    query.set("focus", focus);
  }

  const encoded = query.toString();
  return encoded.length > 0 ? `/?${encoded}` : "/";
}

function getInitials(label: string | null) {
  if (!label) {
    return "CT";
  }

  const tokens = label
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return tokens.length > 0 ? tokens.toUpperCase() : "CT";
}

async function getDeployments(scope: AccessScope) {
  try {
    if (!scope.isPlatformAdmin && scope.tribes.length === 0) {
      return {
        deployments: [] as Deployment[],
        error: null,
      };
    }

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("deployments")
      .select("id, repository, tribe, branch, environment, status, summary, commit_sha, duration_seconds, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!scope.isPlatformAdmin) {
      query = query.in("tribe", scope.tribes);
    }

    const { data, error } = await query;

    if (error) {
      return {
        deployments: [] as Deployment[],
        error:
          "Supabase query failed. Run supabase/schema.sql and verify your environment variables.",
      };
    }

    return {
      deployments: (data ?? []) as Deployment[],
      error: null,
    };
  } catch (error) {
    return {
      deployments: [] as Deployment[],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while loading dashboard data.",
    };
  }
}

async function getWorkflowRuns(scope: AccessScope) {
  try {
    if (!scope.isPlatformAdmin && scope.tribes.length === 0) {
      return {
        runs: [] as WorkflowRun[],
        error: null,
      };
    }

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("workflow_runs")
      .select(
        "id, repository, run_id, run_attempt, workflow_name, branch, environment, tribe, status, github_status, github_conclusion, event_name, action, run_url, commit_sha, started_at, completed_at, duration_seconds, created_at, updated_at",
      )
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(80);

    if (!scope.isPlatformAdmin) {
      query = query.in("tribe", scope.tribes);
    }

    const { data, error } = await query;

    if (error) {
      return {
        runs: [] as WorkflowRun[],
        error: "Unable to load workflow runs for the runs tab.",
      };
    }

    return {
      runs: (data ?? []) as WorkflowRun[],
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

async function getTribeHealth(scope: AccessScope, windowDays = 14) {
  try {
    if (!scope.isPlatformAdmin && scope.tribes.length === 0) {
      return {
        rows: [] as TribeHealthRow[],
        error: null,
      };
    }

    const supabase = createSupabaseAdminClient();
    const since = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    let query = supabase
      .from("workflow_runs")
      .select("tribe, status, duration_seconds, created_at")
      .gte("created_at", since)
      .limit(5000);

    if (!scope.isPlatformAdmin) {
      query = query.in("tribe", scope.tribes);
    }

    const { data, error } = await query;

    if (error) {
      return {
        rows: [] as TribeHealthRow[],
        error: "Unable to load tribe health metrics from workflow runs.",
      };
    }

    const byTribe = new Map<
      string,
      {
        total: number;
        success: number;
        failed: number;
        running: number;
        durationSum: number;
        durationCount: number;
      }
    >();

    for (const run of data ?? []) {
      const tribe =
        typeof run.tribe === "string" && run.tribe.trim().length > 0
          ? run.tribe
          : "unmapped";

      const current = byTribe.get(tribe) ?? {
        total: 0,
        success: 0,
        failed: 0,
        running: 0,
        durationSum: 0,
        durationCount: 0,
      };

      current.total += 1;
      if (run.status === "success") {
        current.success += 1;
      } else if (run.status === "failed") {
        current.failed += 1;
      } else if (run.status === "running") {
        current.running += 1;
      }

      if (typeof run.duration_seconds === "number") {
        current.durationSum += run.duration_seconds;
        current.durationCount += 1;
      }

      byTribe.set(tribe, current);
    }

    const rows = Array.from(byTribe.entries())
      .map(([tribe, value]) => {
        const successRate = value.total > 0 ? (value.success / value.total) * 100 : 0;
        const averageDurationSeconds =
          value.durationCount > 0
            ? Math.round(value.durationSum / value.durationCount)
            : 0;

        return {
          tribe,
          totalRuns: value.total,
          successRate: Math.round(successRate * 10) / 10,
          failedRuns: value.failed,
          runningRuns: value.running,
          averageDurationSeconds,
        } satisfies TribeHealthRow;
      })
      .sort((a, b) => b.totalRuns - a.totalRuns);

    return {
      rows,
      error: null,
    };
  } catch (error) {
    return {
      rows: [] as TribeHealthRow[],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while loading tribe health metrics.",
    };
  }
}

export default async function Home({ searchParams }: HomePageProps) {
  const accessScope = await getAuthenticatedAccessScope();

  if (!accessScope) {
    redirect("/auth/login?next=/");
  }

  const resolvedParams = await searchParams;
  const currentTab = normalizeTab(getSingleParam(resolvedParams.tab));
  const focusFilter = normalizeFocusFilter(getSingleParam(resolvedParams.focus));

  const [
    { deployments, error },
    { runs: workflowRuns, error: workflowRunsError },
    { rows: tribeHealth, error: tribeHealthError },
  ] = await Promise.all([
    getDeployments(accessScope),
    getWorkflowRuns(accessScope),
    getTribeHealth(accessScope, 14),
  ]);

  const filteredDeployments = filterDeployments(deployments, focusFilter);
  const filteredWorkflowRuns = filterWorkflowRuns(workflowRuns, focusFilter);
  const metrics = getMetrics(deployments);
  const reliabilityBand = getReliabilityBand(metrics.successRate);
  const hasTribeAccess = accessScope.isPlatformAdmin || accessScope.tribes.length > 0;

  const profileName =
    accessScope.githubDisplayName ??
    accessScope.githubUsername ??
    accessScope.email ??
    "Control Tower User";
  const profileHandle = accessScope.githubUsername
    ? `@${accessScope.githubUsername}`
    : accessScope.email;

  const visibleTribeLabel = accessScope.isPlatformAdmin
    ? "All tribes"
    : accessScope.tribes.length > 0
      ? accessScope.tribes.join(", ")
      : "No tribe assignment";

  const deploymentFocusItems =
    filteredDeployments.filter((item) => item.status === "failed" || item.status === "running")
      .length > 0
      ? filteredDeployments
          .filter((item) => item.status === "failed" || item.status === "running")
          .slice(0, 4)
      : filteredDeployments.slice(0, 4);

  const runFocusItems =
    filteredWorkflowRuns.filter((item) => item.status === "failed" || item.status === "running")
      .length > 0
      ? filteredWorkflowRuns
          .filter((item) => item.status === "failed" || item.status === "running")
          .slice(0, 4)
      : filteredWorkflowRuns.slice(0, 4);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-24 -top-20 h-80 w-80 rounded-full bg-[oklch(0.93_0.045_52_/_0.85)] blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <main className="relative mx-auto w-full max-w-[1180px] space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
            <LayoutDashboard className="size-4" />
            Control Tower
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 shadow-sm">
              {accessScope.githubAvatarUrl ? (
                <span
                  role="img"
                  aria-label={profileName}
                  className="size-8 rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${accessScope.githubAvatarUrl})` }}
                />
              ) : (
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                  {getInitials(profileName)}
                </span>
              )}
              <div className="leading-tight">
                <p className="text-sm font-medium text-foreground">{profileName}</p>
                <p className="text-xs text-muted-foreground">{profileHandle}</p>
              </div>
            </div>

            {accessScope.githubProfileUrl ? (
              <a
                href={accessScope.githubProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                GitHub Profile
              </a>
            ) : null}

            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Logout
              </button>
            </form>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(tabLabels) as DashboardTab[]).map((tab) => (
              <a
                key={tab}
                href={buildDashboardHref(tab, focusFilter)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === currentTab
                    ? "bg-foreground text-background"
                    : "border border-border/70 bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {tabLabels[tab]}
              </a>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Tribe scope: <span className="font-medium text-foreground">{visibleTribeLabel}</span>
          </p>
        </section>

        {!hasTribeAccess ? (
          <Alert>
            <AlertTitle>No Tribe Access Assigned</AlertTitle>
            <AlertDescription>
              Your account is authenticated but has no active tribe membership. Ask a platform admin to add your user to user_tribe_membership.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Dashboard data is unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {currentTab === "runs" && workflowRunsError ? (
          <Alert variant="destructive">
            <AlertTitle>Workflow runs are unavailable</AlertTitle>
            <AlertDescription>{workflowRunsError}</AlertDescription>
          </Alert>
        ) : null}

        {currentTab === "summary" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-4xl font-semibold text-foreground">{metrics.successRate}%</p>
                <p className="text-xs text-muted-foreground">{reliabilityBand} reliability posture</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-4xl font-semibold text-foreground">{metrics.total}</p>
                <p className="text-xs text-muted-foreground">Latest deployment summaries</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-4xl font-semibold text-foreground">{metrics.failed}</p>
                <p className="text-xs text-muted-foreground">Requires triage</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Running</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-4xl font-semibold text-foreground">{metrics.running}</p>
                <p className="text-xs text-muted-foreground">Active pipelines now</p>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {currentTab === "metrics" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tribeHealthError ? (
              <Alert variant="destructive">
                <AlertTitle>Tribe Metrics Unavailable</AlertTitle>
                <AlertDescription>{tribeHealthError}</AlertDescription>
              </Alert>
            ) : tribeHealth.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                No tribe telemetry yet. Trigger workflows in connected repositories.
              </p>
            ) : (
              tribeHealth.map((item) => (
                <Card key={item.tribe} className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{item.tribe}</CardTitle>
                    <CardDescription>{item.totalRuns} runs in last 14 days</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Success rate: <span className="font-medium text-foreground">{item.successRate}%</span>
                    </p>
                    <p>
                      Failed runs: <span className="font-medium text-foreground">{item.failedRuns}</span>
                    </p>
                    <p>
                      Running runs: <span className="font-medium text-foreground">{item.runningRuns}</span>
                    </p>
                    <p>
                      Avg duration: <span className="font-medium text-foreground">{item.averageDurationSeconds}s</span>
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                {currentTab === "runs" ? "Workflow Runs" : "Delivery Pipeline"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {currentTab === "runs"
                  ? "Run telemetry with direct drill-down into run and job details."
                  : "Source of truth from webhook and sync-ingested workflow telemetry."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                Focus: {focusLabels[focusFilter]}
              </span>
              {currentTab === "runs" ? (
                <Link
                  href="/runs"
                  className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Open Runs Explorer
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(focusLabels) as FocusFilter[]).map((focus) => (
              <a
                key={focus}
                href={buildDashboardHref(currentTab, focus)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  focusFilter === focus
                    ? "bg-foreground text-background"
                    : "border border-border/70 bg-card text-foreground hover:bg-muted"
                }`}
              >
                {focusLabels[focus]}
              </a>
            ))}
          </div>

          {currentTab === "runs" ? (
            <Card className="rounded-[28px] border-border/70 bg-card/95 shadow-sm">
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
                        <th className="px-4 py-3 font-medium">Next Action</th>
                        <th className="px-4 py-3 font-medium">Last Activity</th>
                        <th className="px-4 py-3 font-medium">Tribe</th>
                        <th className="px-4 py-3 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWorkflowRuns.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            No workflow runs match this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredWorkflowRuns.slice(0, 25).map((run) => (
                          <tr
                            key={run.id}
                            className="border-b border-border/60 last:border-b-0 hover:bg-background/50"
                          >
                            <td className="px-4 py-3.5 font-medium text-foreground">{run.repository}</td>
                            <td className="px-4 py-3.5 text-muted-foreground">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">
                                  {run.workflow_name ?? "Workflow"}
                                </p>
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
                              {getRunNextAction(run)}
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
          ) : (
            <Card className="rounded-[28px] border-border/70 bg-card/95 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="border-b border-border/70 bg-background/65 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Repository</th>
                        <th className="px-4 py-3 font-medium">Branch</th>
                        <th className="px-4 py-3 font-medium">Duration</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Risk</th>
                        <th className="px-4 py-3 font-medium">Next Action</th>
                        <th className="px-4 py-3 font-medium">Last Activity</th>
                        <th className="px-4 py-3 font-medium">Tribe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeployments.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-10 text-center text-sm text-muted-foreground"
                          >
                            No deployment rows match this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredDeployments.slice(0, 20).map((deployment) => {
                          const risk = getRiskTone(deployment.status);

                          return (
                            <tr
                              key={deployment.id}
                              className="border-b border-border/60 last:border-b-0 hover:bg-background/50"
                            >
                              <td className="px-4 py-3.5 font-medium text-foreground">{deployment.repository}</td>
                              <td className="px-4 py-3.5 text-muted-foreground">{deployment.branch}</td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {formatRuntime(deployment.duration_seconds)}
                              </td>
                              <td className="px-4 py-3.5">
                                <StatusBadge status={deployment.status} />
                              </td>
                              <td className="px-4 py-3.5">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${risk.className}`}
                                >
                                  {risk.label}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {getNextAction(deployment)}
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {formatRelativeTime(deployment.created_at)}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="inline-flex rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                                  {deployment.tribe ?? "unmapped"}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Operations Brief</CardTitle>
              <CardDescription>Immediate actions for run health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {currentTab === "runs" ? (
                runFocusItems.length === 0 ? (
                  <p>No workflow runs yet. Trigger workflows to populate this view.</p>
                ) : (
                  runFocusItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border/70 bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">{item.repository}</p>
                        <Link
                          href={`/runs/${item.id}`}
                          className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          Open run
                        </Link>
                      </div>
                      <p className="text-xs">{getRunNextAction(item)}</p>
                    </div>
                  ))
                )
              ) : deploymentFocusItems.length === 0 ? (
                <p>No deployment activity yet. Trigger workflows to populate this view.</p>
              ) : (
                deploymentFocusItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-background px-3 py-2">
                    <p className="font-medium text-foreground">{item.repository}</p>
                    <p className="text-xs">{getNextAction(item)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Reliability band: <span className="font-medium text-foreground">{reliabilityBand}</span>. Average runtime: <span className="font-medium text-foreground">{metrics.averageDuration}s</span>.
          </p>
        </section>
      </main>
    </div>
  );
}
