import { Badge } from "@/components/ui/badge";
import type { DeploymentStatus } from "@/lib/supabase/types";

const statusClassMap: Record<DeploymentStatus, string> = {
  queued: "border-slate-300 bg-slate-100 text-slate-700",
  running: "border-sky-300 bg-sky-100 text-sky-700",
  success: "border-emerald-300 bg-emerald-100 text-emerald-700",
  failed: "border-rose-300 bg-rose-100 text-rose-700",
  cancelled: "border-amber-300 bg-amber-100 text-amber-700",
};

export function StatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <Badge variant="outline" className={`capitalize font-medium ${statusClassMap[status]}`}>
      {status}
    </Badge>
  );
}
