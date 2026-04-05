import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AlertRule = {
  id: string;
  name: string;
  tribe: string | null;
  rule_type: "success_rate_below" | "failed_run_count_above" | "duration_above";
  threshold: number;
  window_minutes: number;
  channels: string[];
};

export type TriggeredAlert = {
  rule: AlertRule;
  tribe: string | null;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
};

type TribeMetrics = {
  tribe: string;
  successRate: number;
  failedCount: number;
  avgDurationSeconds: number;
  totalRuns: number;
};

async function getTribeMetrics(tribe: string | null, windowMinutes: number): Promise<TribeMetrics[]> {
  const supabase = createSupabaseAdminClient();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  let query = supabase
    .from("workflow_runs")
    .select("tribe, status, duration_seconds")
    .gte("created_at", since)
    .limit(5000);

  if (tribe) {
    query = query.eq("tribe", tribe);
  }

  const { data } = await query;
  const byTribe = new Map<string, { total: number; success: number; failed: number; durationSum: number; durationCount: number }>();

  for (const row of data ?? []) {
    const t = typeof row.tribe === "string" && row.tribe.trim() ? row.tribe : "unmapped";
    const current = byTribe.get(t) ?? { total: 0, success: 0, failed: 0, durationSum: 0, durationCount: 0 };
    current.total += 1;
    if (row.status === "success") current.success += 1;
    if (row.status === "failed") current.failed += 1;
    if (typeof row.duration_seconds === "number") {
      current.durationSum += row.duration_seconds;
      current.durationCount += 1;
    }
    byTribe.set(t, current);
  }

  return Array.from(byTribe.entries()).map(([t, v]) => ({
    tribe: t,
    successRate: v.total > 0 ? (v.success / v.total) * 100 : 100,
    failedCount: v.failed,
    avgDurationSeconds: v.durationCount > 0 ? v.durationSum / v.durationCount : 0,
    totalRuns: v.total,
  }));
}

export async function evaluateAlertRules(tribe?: string): Promise<TriggeredAlert[]> {
  const supabase = createSupabaseAdminClient();

  let rulesQuery = supabase
    .from("alert_rules")
    .select("id, name, tribe, rule_type, threshold, window_minutes, channels")
    .eq("is_enabled", true);

  if (tribe) {
    rulesQuery = rulesQuery.or(`tribe.eq.${tribe},tribe.is.null`);
  }

  const { data: rules } = await rulesQuery;
  if (!rules || rules.length === 0) return [];

  const triggered: TriggeredAlert[] = [];

  for (const rule of rules as AlertRule[]) {
    const metrics = await getTribeMetrics(rule.tribe, rule.window_minutes);

    for (const m of metrics) {
      let fires = false;
      let title = "";
      let body = "";
      let severity: TriggeredAlert["severity"] = "warning";

      if (rule.rule_type === "success_rate_below") {
        if (m.totalRuns > 0 && m.successRate < rule.threshold) {
          fires = true;
          title = `Low success rate: ${m.tribe}`;
          body = `Success rate is ${m.successRate.toFixed(1)}% (threshold: ${rule.threshold}%) over the last ${rule.window_minutes}min. ${m.totalRuns} runs sampled.`;
          severity = m.successRate < 70 ? "critical" : "warning";
        }
      } else if (rule.rule_type === "failed_run_count_above") {
        if (m.failedCount > rule.threshold) {
          fires = true;
          title = `High failure count: ${m.tribe}`;
          body = `${m.failedCount} failed runs (threshold: ${rule.threshold}) in the last ${rule.window_minutes}min.`;
          severity = m.failedCount > rule.threshold * 2 ? "critical" : "warning";
        }
      } else if (rule.rule_type === "duration_above") {
        if (m.avgDurationSeconds > rule.threshold) {
          fires = true;
          title = `Slow runs: ${m.tribe}`;
          body = `Average run duration is ${Math.round(m.avgDurationSeconds)}s (threshold: ${rule.threshold}s) over the last ${rule.window_minutes}min.`;
          severity = "warning";
        }
      }

      if (fires) {
        triggered.push({ rule, tribe: m.tribe, title, body, severity });
      }
    }
  }

  return triggered;
}
