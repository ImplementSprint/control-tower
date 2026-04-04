import { Badge } from "@/components/ui/badge";
import type { DeploymentStatus } from "@/lib/supabase/types";

const statusVariantMap: Record<DeploymentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "secondary",
  success: "default",
  failed: "destructive",
  cancelled: "outline",
};

export function StatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <Badge variant={statusVariantMap[status]} className="capitalize">
      {status}
    </Badge>
  );
}
