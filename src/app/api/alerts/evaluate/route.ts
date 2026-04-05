import { NextResponse } from "next/server";
import { evaluateAlertRules } from "@/lib/alerts/evaluate";
import { dispatchAlerts } from "@/lib/alerts/dispatch";
import { jsonError } from "@/lib/api/responses";
import { logEvent } from "@/lib/observability";

// Called by external cron or POST from webhook handler
export async function POST(request: Request) {
  try {
    // Simple token auth for cron calls
    const auth = request.headers.get("authorization");
    const token = process.env.INGESTION_TOKEN;
    if (token && auth !== `Bearer ${token}`) {
      return jsonError("Unauthorized.", 401);
    }

    const body = await request.json().catch(() => ({})) as { tribe?: string };
    const tribe = typeof body.tribe === "string" ? body.tribe : undefined;

    const triggered = await evaluateAlertRules(tribe);
    await dispatchAlerts(triggered);

    logEvent("info", "alerts.evaluate_complete", { triggeredCount: triggered.length, tribe });

    return NextResponse.json({ evaluated: true, triggered: triggered.length });
  } catch (error) {
    logEvent("error", "alerts.evaluate_failed", { error: error instanceof Error ? error.message : "unknown" });
    return jsonError(error instanceof Error ? error.message : "Unexpected error.", 500);
  }
}
