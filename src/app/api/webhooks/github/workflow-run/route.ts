import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
	createAuditEvent,
	resolveTribeForRepository,
} from "@/lib/control-tower/governance";
import {
	buildRunIdTag,
	calculateDurationSeconds,
	getBranchEnvironment,
	resolveDeploymentStatus,
} from "@/lib/control-tower/github-run-mapping";
import { upsertDeploymentFromRunIdentity } from "@/lib/control-tower/deployment-ingestion";
import { logEvent } from "@/lib/observability";

type GitHubWorkflowRunPayload = {
	action?: string;
	repository?: {
		name?: string;
		full_name?: string;
		default_branch?: string;
	};
	workflow?: {
		name?: string;
	};
	workflow_run?: {
		id?: number;
		run_attempt?: number;
		html_url?: string;
		name?: string;
		status?: string;
		conclusion?: string | null;
		head_branch?: string | null;
		head_sha?: string | null;
		run_started_at?: string | null;
		updated_at?: string | null;
	};
};

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

	const workflowRun = payload.workflow_run;
	const repository = payload.repository;

	if (!workflowRun?.id || !repository) {
		return NextResponse.json(
			{ error: "Invalid workflow_run payload: missing workflow_run.id or repository." },
			{ status: 400 },
		);
	}

	const repositoryName = repository.full_name ?? repository.name ?? "unknown/repository";
	const branch = workflowRun.head_branch ?? repository.default_branch ?? "test";
	const action = (payload.action ?? "").toLowerCase();
	const runStatus = (workflowRun.status ?? "").toLowerCase();
	const runConclusion = (workflowRun.conclusion ?? "").toLowerCase();
	const status = resolveDeploymentStatus({
		action,
		status: runStatus,
		conclusion: runConclusion,
	});
	const environment = getBranchEnvironment(branch);
	const runAttempt =
		typeof workflowRun.run_attempt === "number" && workflowRun.run_attempt > 0
			? workflowRun.run_attempt
			: 1;
	const runIdTag = buildRunIdTag(workflowRun.id, runAttempt);
	const runUrl = workflowRun.html_url ?? "";
	const workflowName =
		workflowRun.name ?? payload.workflow?.name ?? "Workflow";
	const durationSeconds = calculateDurationSeconds(
		workflowRun.run_started_at,
		workflowRun.updated_at,
	);

	logEvent("info", "github.webhook.workflow_run.received", {
		repository: repositoryName,
		run_id: workflowRun.id,
		run_attempt: runAttempt,
		action,
		status,
		environment,
	});


	try {
		const supabase = createSupabaseAdminClient();
		const tribe = await resolveTribeForRepository(supabase, repositoryName);
		const summary = `[tribe:${tribe}] ${workflowName} ${status} (${runIdTag})${runUrl ? ` ${runUrl}` : ""}`.slice(
			0,
			500,
		);
		const deliveryId =
			request.headers.get("x-github-delivery") ??
			`${repositoryName}:${workflowRun.id}:${runAttempt}:${action || runStatus || "event"}`;

		const { error: rawEventError } = await supabase
			.from("github_webhook_events")
			.upsert(
				{
					delivery_id: deliveryId,
					event_name: eventName,
					action: action || null,
					repository: repositoryName,
					payload,
					signature_valid: true,
				},
				{ onConflict: "delivery_id" },
			);

		if (rawEventError) {
			return NextResponse.json(
				{
					error: "Failed to store raw webhook event.",
					details: rawEventError.message,
				},
				{ status: 500 },
			);
		}

		const completedAt = runStatus === "completed" ? workflowRun.updated_at ?? null : null;

		const { error: workflowRunUpsertError } = await supabase
			.from("workflow_runs")
			.upsert(
				{
					repository: repositoryName,
					run_id: workflowRun.id,
					run_attempt: runAttempt,
					workflow_name: workflowName,
					branch,
					environment,
					tribe,
					status,
					github_status: runStatus || null,
					github_conclusion: runConclusion || null,
					event_name: eventName,
					action: action || null,
					run_url: runUrl || null,
					commit_sha: workflowRun.head_sha ?? null,
					started_at: workflowRun.run_started_at ?? null,
					completed_at: completedAt,
					duration_seconds: durationSeconds,
				},
				{ onConflict: "repository,run_id,run_attempt" },
			);

		if (workflowRunUpsertError) {
			return NextResponse.json(
				{
					error: "Failed to upsert normalized workflow run.",
					details: workflowRunUpsertError.message,
				},
				{ status: 500 },
			);
		}

		await upsertDeploymentFromRunIdentity(supabase, {
			repository: repositoryName,
			tribe,
			branch,
			environment,
			status,
			summary,
			commitSha: workflowRun.head_sha ?? null,
			durationSeconds,
			runId: workflowRun.id,
			runAttempt,
		});

		revalidatePath("/");

		try {
			await createAuditEvent(supabase, {
				eventType: "workflow_run.ingested",
				source: "github-webhook",
				actor: deliveryId,
				actorType: "webhook",
				repository: repositoryName,
				tribe,
				branch,
				environment,
				runId: workflowRun.id,
				runAttempt: runAttempt,
				details: {
					status,
					action,
					run_url: runUrl || null,
				},
			});
		} catch (auditError) {
			logEvent("warn", "github.webhook.audit_write_failed", {
				repository: repositoryName,
				run_id: workflowRun.id,
				run_attempt: runAttempt,
				details: auditError instanceof Error ? auditError.message : "Unknown error",
			});
		}

		logEvent("info", "github.webhook.workflow_run.ingested", {
			delivery_id: deliveryId,
			repository: repositoryName,
			run_id: workflowRun.id,
			run_attempt: runAttempt,
			status,
			action,
			environment,
		});

		return NextResponse.json({
			ok: true,
			delivery_id: deliveryId,
			run_id: workflowRun.id,
			run_attempt: runAttempt,
			repository: repositoryName,
			branch,
			tribe,
			status,
			source_event: eventName,
			action,
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
