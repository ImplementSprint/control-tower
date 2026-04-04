import { Activity, CheckCircle2, Clock3, XCircle } from "lucide-react";
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

export default async function Home() {
  const { deployments, error } = await getDeployments();
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
