import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/formatters";
import { AlertRuleActions } from "./alert-actions";

export const dynamic = "force-dynamic";

type AlertRule = {
  id: string;
  name: string;
  tribe: string | null;
  rule_type: string;
  threshold: number;
  window_minutes: number;
  channels: string[];
  is_enabled: boolean;
  created_by: string | null;
  updated_at: string;
};

const ruleTypeLabels: Record<string, string> = {
  success_rate_below: "Success Rate Below",
  failed_run_count_above: "Failed Count Above",
  duration_above: "Duration Above",
};

async function getAlertRules(): Promise<AlertRule[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("alert_rules")
    .select("id, name, tribe, rule_type, threshold, window_minutes, channels, is_enabled, created_by, updated_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as AlertRule[];
}

export default async function AlertsPage() {
  const rules = await getAlertRules();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alert Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Threshold-based alerts dispatched to Slack or in-app notifications.
          </p>
        </div>
        <AlertRuleActions />
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {rules.length} rule{rules.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No alert rules yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Trigger</th>
                    <th className="pb-2 pr-4 font-medium">Scope</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-4 font-medium">{r.name}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="rounded-full text-xs">
                          {ruleTypeLabels[r.rule_type] ?? r.rule_type}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {r.rule_type === "success_rate_below" && `< ${r.threshold}%`}
                        {r.rule_type === "failed_run_count_above" && `> ${r.threshold} failures`}
                        {r.rule_type === "duration_above" && `> ${r.threshold}s avg`}
                        {" "}/ {r.window_minutes >= 1440 ? `${r.window_minutes / 1440}d` : `${r.window_minutes}min`}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {r.tribe ?? "Global"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.is_enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {r.is_enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {formatRelativeTime(r.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
