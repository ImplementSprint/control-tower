import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getRunNextAction } from "@/lib/dashboard/home-presenters";
import { formatRelativeTime, formatRuntime } from "@/lib/formatters";
import type { WorkflowRun } from "@/lib/supabase/types";

type WorkflowRunSummaryProps = {
  workflowRuns: WorkflowRun[];
};

export function WorkflowRunSummary({ workflowRuns }: WorkflowRunSummaryProps) {
  return (
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
              {workflowRuns.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No workflow runs match this filter.
                  </td>
                </tr>
              ) : (
                workflowRuns.slice(0, 25).map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-border/60 last:border-b-0 hover:bg-background/50"
                  >
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      {run.repository}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {run.workflow_name ?? "Workflow"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          run #{run.run_id} / attempt {run.run_attempt}
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
  );
}
