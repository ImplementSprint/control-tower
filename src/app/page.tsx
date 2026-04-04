import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Layers3,
  SignalHigh,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeploymentsTable } from "@/components/deployments-table";
import { NewDeploymentForm } from "@/components/new-deployment-form";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Deployment } from "@/lib/supabase/types";

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

  const metricTiles = [
    {
      label: "Pipeline Events",
      value: String(metrics.total),
      helper: "Last 30 deployment summaries",
      icon: Activity,
      gradient: "from-primary/25 via-primary/10 to-transparent",
    },
    {
      label: "Success Rate",
      value: `${metrics.successRate}%`,
      helper: `${reliabilityBand} reliability posture`,
      icon: CheckCircle2,
      gradient: "from-emerald-500/25 via-emerald-500/10 to-transparent",
    },
    {
      label: "Failed Pipelines",
      value: String(metrics.failed),
      helper: "Needing triage attention",
      icon: XCircle,
      gradient: "from-rose-500/25 via-rose-500/10 to-transparent",
    },
    {
      label: "Average Runtime",
      value: `${metrics.averageDuration}s`,
      helper: `${metrics.running} actively running now`,
      icon: Clock3,
      gradient: "from-sky-500/25 via-sky-500/10 to-transparent",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-clip pb-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-12 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute right-0 top-28 h-80 w-80 rounded-full bg-cyan-300/30 blur-3xl" />
      </div>

      <main className="relative mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="panel-sheen animate-fade-up relative overflow-hidden rounded-3xl border border-white/70 bg-white/75 p-6 shadow-[0_20px_80px_-40px_oklch(0.45_0.11_252)] backdrop-blur-xl sm:p-8">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl animate-float-slow" />
          <div className="absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-cyan-300/25 blur-3xl animate-float-slow" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5" />
                Realtime CI Governance
              </div>

              <div className="space-y-3">
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  Command your delivery lanes with confidence.
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Control Tower unifies deployment telemetry, tribe ownership intelligence,
                  and governance signals into one SaaS command surface for leadership and
                  engineering operations.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:text-sm">
                <span className="rounded-full border border-border/80 bg-white/75 px-3 py-1.5">
                  {metrics.success} successful runs
                </span>
                <span className="rounded-full border border-border/80 bg-white/75 px-3 py-1.5">
                  {metrics.running} pipelines running
                </span>
                <span className="rounded-full border border-border/80 bg-white/75 px-3 py-1.5">
                  {tribeHealth.length} active tribes observed
                </span>
              </div>
            </div>

            <div className="grid w-full max-w-sm gap-3 rounded-2xl border border-primary/20 bg-white/80 p-4 shadow-sm backdrop-blur lg:ml-6">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span>Reliability Snapshot</span>
                <ArrowUpRight className="size-4" />
              </div>
              <p className="text-4xl font-semibold text-foreground">{metrics.successRate}%</p>
              <p className="text-sm text-muted-foreground">
                Current delivery posture is <span className="font-semibold text-foreground">{reliabilityBand}</span>.
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <Alert variant="destructive" className="animate-fade-up">
            <AlertTitle>Dashboard data is unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricTiles.map((tile, index) => {
            const Icon = tile.icon;

            return (
              <Card
                key={tile.label}
                className="animate-fade-up relative overflow-hidden border-white/70 bg-white/75 shadow-[0_14px_50px_-30px_oklch(0.45_0.1_252)] backdrop-blur"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${tile.gradient}`} />
                <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {tile.label}
                  </CardTitle>
                  <div className="rounded-xl border border-white/75 bg-white/80 p-2">
                    <Icon className="size-4 text-foreground/70" />
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                    {tile.value}
                  </div>
                  <CardDescription className="mt-1 text-xs sm:text-sm">
                    {tile.helper}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-white/70 bg-white/75 shadow-[0_18px_70px_-38px_oklch(0.45_0.1_252)] backdrop-blur">
            <CardHeader>
              <div className="flex items-center gap-2">
                <SignalHigh className="size-4 text-muted-foreground" />
                <CardTitle>Tribe Health (14d)</CardTitle>
              </div>
              <CardDescription>
                Success rate and throughput from normalized workflow runs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tribeHealthError ? (
                <p className="text-sm text-destructive">{tribeHealthError}</p>
              ) : tribeHealth.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No workflow telemetry yet. Trigger webhook events or run backfill sync.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {tribeHealth.slice(0, 6).map((item) => (
                    <div
                      key={item.tribe}
                      className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm"
                    >
                      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                        {item.tribe}
                      </p>
                      <p className="mt-2 font-heading text-2xl font-semibold">{item.successRate}%</p>
                      <p className="text-xs text-muted-foreground">success rate</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(item.successRate, 100)}%` }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{item.totalRuns} runs</span>
                        <span>{item.failedRuns} failed</span>
                        <span>{item.runningRuns} running</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Avg duration: {item.averageDurationSeconds}s
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="panel-sheen border-white/70 bg-white/75 shadow-[0_18px_70px_-38px_oklch(0.45_0.1_252)] backdrop-blur">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers3 className="size-4 text-muted-foreground" />
                <CardTitle>Ops Checklist</CardTitle>
              </div>
              <CardDescription>
                Priority flow for stable release operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/70 bg-white/75 px-3 py-2">
                1. Confirm webhook ingestion is healthy and signed.
              </div>
              <div className="rounded-xl border border-border/70 bg-white/75 px-3 py-2">
                2. Review failed job clusters by tribe before promotion.
              </div>
              <div className="rounded-xl border border-border/70 bg-white/75 px-3 py-2">
                3. Track audit events for manual overrides and gate bypasses.
              </div>
              <div className="rounded-xl border border-border/70 bg-white/75 px-3 py-2">
                4. Keep ownership map current for escalation confidence.
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="animate-fade-up" style={{ animationDelay: "220ms" }}>
          <NewDeploymentForm />
        </section>

        <section className="animate-fade-up" style={{ animationDelay: "320ms" }}>
          <Card className="border-white/70 bg-white/75 shadow-[0_18px_70px_-38px_oklch(0.45_0.1_252)] backdrop-blur">
            <CardHeader>
              <CardTitle>Recent Deployments</CardTitle>
              <CardDescription>
                Records are stored in Supabase table public.deployments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeploymentsTable deployments={deployments} />
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
