import {
  Bell,
  ChevronDown,
  ChevronLeft,
  FolderClosed,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewDeploymentForm } from "@/components/new-deployment-form";
import { StatusBadge } from "@/components/status-badge";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Deployment, DeploymentStatus } from "@/lib/supabase/types";

type TribeHealthRow = {
  tribe: string;
  totalRuns: number;
  successRate: number;
  failedRuns: number;
  runningRuns: number;
  averageDurationSeconds: number;
};

export const dynamic = "force-dynamic";

async function getDeployments() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("deployments")
      .select("id, repository, branch, environment, status, summary, commit_sha, duration_seconds, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(30);

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

function getMetrics(deployments: Deployment[]) {
  const total = deployments.length;
  const success = deployments.filter((item) => item.status === "success").length;
  const failed = deployments.filter((item) => item.status === "failed").length;
  const running = deployments.filter((item) => item.status === "running").length;
  const successRate = total > 0 ? (success / total) * 100 : 0;

  const averageDuration =
    deployments
      .filter((item) => typeof item.duration_seconds === "number")
      .reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0) /
    Math.max(
      deployments.filter((item) => typeof item.duration_seconds === "number").length,
      1,
    );

  return {
    total,
    success,
    failed,
    running,
    successRate: Math.round(successRate * 10) / 10,
    averageDuration: Math.round(averageDuration),
  };
}

function getReliabilityBand(successRate: number) {
  if (successRate >= 95) {
    return "Elite";
  }

  if (successRate >= 85) {
    return "Strong";
  }

  if (successRate >= 70) {
    return "Improving";
  }

  return "At Risk";
}

function formatRuntime(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds)) {
    return "-";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "just now";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function getStageLabel(branch: string) {
  const normalized = branch.trim().toLowerCase();

  if (normalized === "main") {
    return "Release";
  }

  if (normalized === "uat") {
    return "Validation";
  }

  if (normalized === "test") {
    return "Integration";
  }

  return branch;
}

function deriveTribe(repository: string) {
  const [tribe] = repository.split("-");
  const normalized = tribe?.trim().toLowerCase();

  if (!normalized) {
    return "core";
  }

  return normalized;
}

function getRiskTone(status: DeploymentStatus) {
  if (status === "failed") {
    return {
      label: "High",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (status === "running" || status === "cancelled") {
    return {
      label: "Medium",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Low",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function getNextAction(deployment: Deployment) {
  if (deployment.summary && deployment.summary.trim().length > 0) {
    const summary = deployment.summary.trim();
    return summary.length > 44 ? `${summary.slice(0, 44)}...` : summary;
  }

  if (deployment.status === "failed") {
    return "Review failed jobs";
  }

  if (deployment.status === "running") {
    return "Monitor active checks";
  }

  if (deployment.status === "queued") {
    return "Await runner slot";
  }

  if (deployment.status === "cancelled") {
    return "Decide on rerun";
  }

  return "Prepare promotion";
}

async function getTribeHealth(windowDays = 14) {
  try {
    const supabase = createSupabaseAdminClient();
    const since = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from("workflow_runs")
      .select("tribe, status, duration_seconds, created_at")
      .gte("created_at", since)
      .limit(5000);

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

export default async function Home() {
  const [{ deployments, error }, { rows: tribeHealth, error: tribeHealthError }] =
    await Promise.all([getDeployments(), getTribeHealth(14)]);
  const metrics = getMetrics(deployments);
  const reliabilityBand = getReliabilityBand(metrics.successRate);

  const progress = Math.max(0, Math.min(100, metrics.successRate));
  const trendBars = (tribeHealth.length > 0
    ? tribeHealth.slice(0, 6).map((item) => item.totalRuns)
    : [3, 4, 5, 4, 7, 8]) as number[];
  const maxTrend = Math.max(...trendBars, 1);

  const focusItems =
    deployments.filter((item) => item.status === "failed" || item.status === "running").length > 0
      ? deployments.filter((item) => item.status === "failed" || item.status === "running").slice(0, 4)
      : deployments.slice(0, 4);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-24 -top-20 h-80 w-80 rounded-full bg-[oklch(0.93_0.045_52_/_0.85)] blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <main className="relative mx-auto w-full max-w-[1180px] space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
              <ChevronLeft className="size-4" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 shadow-sm">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                AJ
              </span>
              <span className="text-sm font-medium">Alex Jones</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </div>
            <div className="inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
              <FolderClosed className="size-4" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
              <LayoutDashboard className="size-4" />
              Dashboard
            </div>
            <div className="inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
              <Bell className="size-4" />
            </div>
            <div className="inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
              <Users className="size-4" />
            </div>
            <div className="inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground">
              <Settings className="size-4" />
            </div>
          </div>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Dashboard data is unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-5 text-4xl font-semibold tracking-tight sm:text-5xl">
                <h1 className="font-heading text-foreground">Overview</h1>
                <span className="font-heading text-muted-foreground/45">Deals</span>
                <span className="font-heading text-muted-foreground/45">Insights</span>
              </div>
              <div className="mt-4 flex items-center gap-5 border-b border-border/70 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="border-b-2 border-foreground pb-1 text-foreground">Performance</span>
                <span>Forecast</span>
                <span>Pipeline</span>
              </div>
            </div>

            <Card className="rounded-[28px] border-border/70 bg-card/95 shadow-sm">
              <CardContent className="grid gap-5 p-6 md:grid-cols-3">
                <div className="space-y-3 border-border/70 md:border-r md:pr-5">
                  <p className="text-sm font-semibold text-foreground">Release Reliability</p>
                  <p className="text-xs text-muted-foreground">Monthly performance vs target</p>
                  <div
                    className="mx-auto flex size-[6.5rem] items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(oklch(0.72 0.16 74) ${progress * 3.6}deg, oklch(0.93 0.01 248) 0deg)`,
                    }}
                  >
                    <div className="flex size-[4.75rem] items-center justify-center rounded-full border border-border/70 bg-card text-xl font-semibold">
                      {Math.round(progress)}%
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border-border/70 md:border-r md:px-5">
                  <p className="text-sm font-semibold text-foreground">Lead Performance</p>
                  <p className="text-xs text-muted-foreground">Generated vs converted deployments</p>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Successful</p>
                      <p className="font-heading text-4xl font-semibold leading-none text-foreground">{metrics.success}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                      <p className="font-heading text-4xl font-semibold leading-none text-foreground">{metrics.total}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1.5">
                    {Array.from({ length: 16 }).map((_, index) => {
                      const isAccent = index > 9 && index < 14;

                      return (
                        <span
                          key={`lead-bar-${index}`}
                          className={
                            isAccent
                              ? "h-6 rounded-full bg-fuchsia-200"
                              : "h-6 rounded-full bg-slate-200"
                          }
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 md:pl-5">
                  <p className="text-sm font-semibold text-foreground">
                    Delivery Trend: {metrics.successRate.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">Weekly pipeline growth</p>
                  <div className="flex h-30 items-end gap-2 pt-2">
                    {trendBars.map((value, index) => (
                      <div
                        key={`trend-${index}`}
                        className={`w-8 rounded-t-xl ${
                          index === trendBars.length - 2
                            ? "bg-lime-300"
                            : "bg-slate-200"
                        }`}
                        style={{
                          height: `${Math.max((value / maxTrend) * 100, 18)}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[28px] border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Operations Brief</CardTitle>
              <CardDescription>Immediate actions for run health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {focusItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                  No deployment activity yet. Trigger a workflow or create a manual deployment row.
                </p>
              ) : (
                focusItems.map((deployment) => (
                  <div
                    key={`focus-${deployment.id}`}
                    className="rounded-2xl border border-border/70 bg-background/80 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-foreground">
                        {deployment.repository}
                      </p>
                      <StatusBadge status={deployment.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{getNextAction(deployment)}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="uppercase tracking-wide">{deployment.environment}</span>
                      <span>{formatRelativeTime(deployment.created_at)}</span>
                    </div>
                  </div>
                ))
              )}

              <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tribe pulse
                </p>
                {tribeHealthError ? (
                  <p className="mt-2 text-xs text-destructive">{tribeHealthError}</p>
                ) : tribeHealth.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">No tribe telemetry yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {tribeHealth.slice(0, 4).map((item) => (
                      <div key={`tribe-${item.tribe}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{item.tribe}</span>
                          <span className="text-muted-foreground">{item.successRate}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-lime-300"
                            style={{ width: `${Math.min(item.successRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                Today Delivery Pipeline
              </h2>
              <p className="text-sm text-muted-foreground">
                Live delivery activity grouped by repository and deployment state
              </p>
            </div>
            <a
              href="#manual-entry"
              className="inline-flex items-center rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Add deployment
            </a>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-foreground">
              New Runs
            </span>
            <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-foreground">
              High Priority
            </span>
            <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-foreground">
              At Risk
            </span>
            <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-foreground">
              Closing Soon
            </span>
          </div>

          <div className="overflow-x-auto rounded-[28px] border border-border/70 bg-card/95 shadow-sm">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-background/65 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Repository</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Next Action</th>
                  <th className="px-4 py-3 font-medium">Last Activity</th>
                  <th className="px-4 py-3 font-medium">Tribe</th>
                </tr>
              </thead>
              <tbody>
                {deployments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No deployment rows yet. Use Add deployment to seed your pipeline.
                    </td>
                  </tr>
                ) : (
                  deployments.slice(0, 10).map((deployment) => {
                    const risk = getRiskTone(deployment.status);

                    return (
                      <tr
                        key={deployment.id}
                        className="border-b border-border/60 last:border-b-0 hover:bg-background/50"
                      >
                        <td className="px-4 py-3.5 font-medium text-foreground">{deployment.repository}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {getStageLabel(deployment.branch)}
                        </td>
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
                            {deriveTribe(deployment.repository)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="manual-entry" className="space-y-2">
          <details className="rounded-[24px] border border-border/70 bg-card/95 p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
              Manual entry
            </summary>
            <p className="mt-1 text-xs text-muted-foreground">
              Insert a deployment record for incident replay and governance checks.
            </p>
            <div className="mt-4">
              <NewDeploymentForm />
            </div>
          </details>

          <p className="text-xs text-muted-foreground">
            Reliability band: <span className="font-medium text-foreground">{reliabilityBand}</span>
            . Average runtime: <span className="font-medium text-foreground">{metrics.averageDuration}s</span>.
          </p>
        </section>
      </main>
    </div>
  );
}
