import { Activity, CheckCircle2, Clock3, SignalHigh, XCircle } from "lucide-react";
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
    averageDuration: Math.round(averageDuration),
  };
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

  return (
    <div className="flex min-h-screen bg-muted/30">
      <main className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Control Tower</h1>
          <p className="text-muted-foreground">
            Fullstack Next.js deployment dashboard using shadcn/ui and Supabase.
          </p>
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Dashboard data is unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Deployments</CardTitle>
              <Activity className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.total}</div>
              <CardDescription>Last 30 recorded runs</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Successful</CardTitle>
              <CheckCircle2 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.success}</div>
              <CardDescription>Passed deployment checks</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.failed}</div>
              <CardDescription>Requires investigation</CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
              <Clock3 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.averageDuration}s</div>
              <CardDescription>{metrics.running} currently running</CardDescription>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
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
                      className="rounded-lg border bg-background p-4 shadow-sm"
                    >
                      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                        {item.tribe}
                      </p>
                      <p className="mt-2 text-2xl font-semibold">{item.successRate}%</p>
                      <p className="text-xs text-muted-foreground">success rate</p>
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
        </section>

        <section>
          <NewDeploymentForm />
        </section>

        <section>
          <Card>
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
