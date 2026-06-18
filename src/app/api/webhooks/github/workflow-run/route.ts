import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { dispatchAlerts } from "@/lib/alerts/dispatch";
import { evaluateAlertRules } from "@/lib/alerts/evaluate";
import {
  isTerminalDeploymentStatus,
  upsertDeploymentForWorkflowRun,
  writeWorkflowAuditEvent,
} from "@/lib/control-tower/deployment-policy-service";
import { resolveMappedTribeForRepository } from "@/lib/control-tower/governance";
import {
  getWebhookWorkflowRunIdentity,
  type GitHubWorkflowRunPayload,
  normalizeWebhookWorkflowRun,
} from "@/lib/github/workflow-normalizer";
import {
  upsertRawWorkflowEvent,
  upsertWorkflowRunRecord,
} from "@/lib/github/workflow-run-store";
import { logEvent } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isValidSignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(body).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  const received = Buffer.from(signatureHeader);

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}

function parsePayload(rawBody: string, contentType: string) {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const payloadParam = new URLSearchParams(rawBody).get("payload");

    if (!payloadParam) {
      throw new Error("Missing payload parameter in form-encoded webhook body.");
    }

    return JSON.parse(payloadParam) as GitHubWorkflowRunPayload;
  }

  return JSON.parse(rawBody) as GitHubWorkflowRunPayload;
}

function queueAlertEvaluation(tribe: string, repository: string) {
  void evaluateAlertRules(tribe)
    .then((triggered) => dispatchAlerts(triggered))
    .catch((err: unknown) => {
      logEvent("warn", "github.webhook.alert_evaluation_failed", {
        repository,
        tribe,
        details: err instanceof Error ? err.message : "Unknown error",
      });
    });
}

export async function POST(request: Request) {
  const eventName = request.headers.get("x-github-event") ?? "";

  if (eventName === "ping") {
    return NextResponse.json({ ok: true, message: "GitHub webhook ping received." });
  }

  if (eventName !== "workflow_run") {
    return NextResponse.json({ ok: true, ignored: eventName || "unknown" }, { status: 202 });
  }

  const rawBody = await request.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Missing GITHUB_WEBHOOK_SECRET. Set the same secret value used in GitHub webhook configuration.",
      },
      { status: 500 },
    );
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!isValidSignature(rawBody, signatureHeader, secret)) {
    logEvent("warn", "github.webhook.signature_invalid", { event_name: eventName });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "application/json";

  let payload: GitHubWorkflowRunPayload;
  try {
    payload = parsePayload(rawBody, contentType);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to parse webhook payload.",
        details: error instanceof Error ? error.message : "Unknown parse error",
      },
      { status: 400 },
    );
  }

  const identity = getWebhookWorkflowRunIdentity(payload);
  if (!identity) {
    return NextResponse.json(
      { error: "Invalid workflow_run payload: missing workflow_run.id or repository." },
      { status: 400 },
    );
  }

  const action = (payload.action ?? "").toLowerCase();
  const runStatus = (identity.workflowRun.status ?? "").toLowerCase();
  const runAttempt =
    typeof identity.workflowRun.run_attempt === "number" &&
    identity.workflowRun.run_attempt > 0
      ? identity.workflowRun.run_attempt
      : 1;

  logEvent("info", "github.webhook.workflow_run.received", {
    repository: identity.repositoryName,
    run_id: identity.workflowRun.id,
    run_attempt: runAttempt,
    action,
    github_status: runStatus,
  });

  try {
    const supabase = createSupabaseAdminClient();
    const tribe = await resolveMappedTribeForRepository(
      supabase,
      identity.repositoryName,
    );
    if (!tribe) {
      return NextResponse.json(
        {
          error: "Repository is not mapped to an active tribe.",
          repository: identity.repositoryName,
        },
        { status: 422 },
      );
    }

    const record = normalizeWebhookWorkflowRun(payload, tribe, eventName);
    const deliveryId =
      request.headers.get("x-github-delivery") ??
      `${record.repository}:${record.runId}:${record.runAttempt}:${
        record.action || record.githubStatus || "event"
      }`;

    await upsertRawWorkflowEvent(supabase, {
      deliveryId,
      eventName,
      action: record.action || null,
      repository: record.repository,
      payload,
      signatureValid: true,
    });
    await upsertWorkflowRunRecord(supabase, record);
    await upsertDeploymentForWorkflowRun(supabase, record);

    revalidatePath("/");

    if (isTerminalDeploymentStatus(record.status)) {
      queueAlertEvaluation(tribe, record.repository);
    }

    await writeWorkflowAuditEvent(supabase, {
      warnEventName: "github.webhook.audit_write_failed",
      event: {
        eventType: "workflow_run.ingested",
        source: "github-webhook",
        actor: deliveryId,
        actorType: "webhook",
        repository: record.repository,
        tribe,
        branch: record.branch,
        environment: record.environment,
        runId: record.runId,
        runAttempt: record.runAttempt,
        details: {
          status: record.status,
          action: record.action,
          run_url: record.runUrl || null,
        },
      },
    });

    logEvent("info", "github.webhook.workflow_run.ingested", {
      delivery_id: deliveryId,
      repository: record.repository,
      run_id: record.runId,
      run_attempt: record.runAttempt,
      status: record.status,
      action: record.action,
      environment: record.environment,
    });

    return NextResponse.json({
      ok: true,
      delivery_id: deliveryId,
      run_id: record.runId,
      run_attempt: record.runAttempt,
      repository: record.repository,
      branch: record.branch,
      tribe,
      status: record.status,
      source_event: eventName,
      action: record.action,
    });
  } catch (error) {
    logEvent("error", "github.webhook.workflow_run.failed", {
      details: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      {
        error: "Unexpected webhook processing failure.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
