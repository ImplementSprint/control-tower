import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Deployment } from "@/lib/supabase/types";
import { StatusBadge } from "@/components/status-badge";

function formatDuration(seconds: number | null) {
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

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function DeploymentsTable({ deployments }: { deployments: Deployment[] }) {
  if (deployments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
        No deployment rows yet. Create one using the form above.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Repository</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deployments.map((deployment) => (
            <TableRow key={deployment.id} className="hover:bg-muted/20">
              <TableCell className="font-medium">{deployment.repository}</TableCell>
              <TableCell>{deployment.branch}</TableCell>
              <TableCell className="uppercase tracking-wide text-xs text-muted-foreground">
                {deployment.environment}
              </TableCell>
              <TableCell>
                <StatusBadge status={deployment.status} />
              </TableCell>
              <TableCell>{formatDuration(deployment.duration_seconds)}</TableCell>
              <TableCell className="font-mono text-xs">
                {deployment.commit_sha ? deployment.commit_sha.slice(0, 12) : "-"}
              </TableCell>
              <TableCell>{formatDate(deployment.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
