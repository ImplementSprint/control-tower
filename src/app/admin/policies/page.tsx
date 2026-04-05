import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/formatters";
import { PolicyActions } from "./policy-actions";

export const dynamic = "force-dynamic";

type PolicyRule = {
  id: string;
  name: string;
  rule_type: string;
  repository: string | null;
  tribe: string | null;
  environment: string | null;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

async function getPolicies(): Promise<PolicyRule[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("policy_rules")
    .select("id, name, rule_type, repository, tribe, environment, is_enabled, config, created_by, created_at, updated_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as PolicyRule[];
}

const ruleTypeLabels: Record<string, string> = {
  block_environment: "Block Env",
  block_status: "Block Status",
  require_summary_on_status: "Require Summary",
};

export default async function PoliciesPage() {
  const policies = await getPolicies();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policy Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Governance rules enforced on deployment mutations.
          </p>
        </div>
        <PolicyActions policies={policies} />
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {policies.length} rule{policies.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {policies.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No policy rules yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Scope</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {policies.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-4 font-medium">{p.name}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="rounded-full text-xs">
                          {ruleTypeLabels[p.rule_type] ?? p.rule_type}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                        {[p.tribe, p.repository, p.environment].filter(Boolean).join(" · ") || "Global"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.is_enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {p.is_enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {formatRelativeTime(p.updated_at)}
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
