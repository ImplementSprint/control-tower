import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { getDeploymentMetrics } from "@/lib/dashboard/home-presenters";

type DeploymentMetrics = ReturnType<typeof getDeploymentMetrics>;

type DeploymentSummaryProps = {
  metrics: DeploymentMetrics;
  reliabilityBand: string;
};

export function DeploymentSummary({
  metrics,
  reliabilityBand,
}: DeploymentSummaryProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-4xl font-semibold text-foreground">
            {metrics.successRate}%
          </p>
          <p className="text-xs text-muted-foreground">
            {reliabilityBand} reliability posture
          </p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Total Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-4xl font-semibold text-foreground">
            {metrics.total}
          </p>
          <p className="text-xs text-muted-foreground">Latest deployment summaries</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Failed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-4xl font-semibold text-foreground">
            {metrics.failed}
          </p>
          <p className="text-xs text-muted-foreground">Requires triage</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Running</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-4xl font-semibold text-foreground">
            {metrics.running}
          </p>
          <p className="text-xs text-muted-foreground">Active pipelines now</p>
        </CardContent>
      </Card>
    </section>
  );
}
