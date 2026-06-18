import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  upsertDeploymentForWorkflowRun,
  writeWorkflowAuditEvent,
} from "@/lib/control-tower/deployment-policy-service";
import { resolveTribeForRepository } from "@/lib/control-tower/governance";
import {
  fetchWorkflowJobs,
  fetchWorkflowRuns,
  mapWithConcurrency,
} from "@/lib/github/github-client";
import {
  buildSyncWorkflowRunPayload,
  normalizeSyncWorkflowRun,
  normalizeWorkflowJob,
} from "@/lib/github/workflow-normalizer";
import {
  upsertRawWorkflowEvent,
  upsertWorkflowJobs,
  upsertWorkflowRunRecord,
} from "@/lib/github/workflow-run-store";
import { logEvent } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  DeploymentEnvironment,
  DeploymentStatus,
} from "@/lib/supabase/types";

type SyncRequestBody = {
  repos?: string[];
  perRepoLimit?: number;
};

function getRequestToken(request: Request) {
  const ingestionHeader = request.headers.get("x-ingestion-token");
  if (ingestionHeader) {
    return ingestionHeader;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function resolveRepoList(bodyRepos: string[] | undefined) {
  if (Array.isArray(bodyRepos) && bodyRepos.length > 0) {
    return bodyRepos.map((repo) => repo.trim()).filter((repo) => repo.length > 0);
  }

  const reposJson = process.env.GITHUB_REPOS_JSON;
  if (reposJson) {
    try {
      const parsed = JSON.parse(reposJson) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((repo) => repo.trim()).filter((repo) => repo.length > 0);
      }
    } catch {
      // Ignore malformed JSON and fall back to CSV.
    }
  }

  const reposCsv = process.env.GITHUB_REPOS_CSV;
  if (!reposCsv) {
    return [];
  }

  return reposCsv
    .split(",")
    .map((repo) => repo.trim())
    .filter((repo) => repo.length > 0);
}

function resolvePerRepoLimit(value: number | undefined) {
  const perRepoLimitRaw = Number(value ?? 20);
  return Number.isFinite(perRepoLimitRaw)
    ? Math.min(Math.max(Math.trunc(perRepoLimitRaw), 1), 100)
    : 20;
}

export async function POST(request: Request) {
  const expectedToken = process.env.INGESTION_TOKEN;
  if (!expectedToken) {
    return NextResponse.json(
      {
        error:
          "Missing INGESTION_TOKEN. Configure INGESTION_TOKEN to protect sync endpoint.",
      },
      { status: 500 },
    );
  }

  const providedToken = getRequestToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized ingestion request." }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!githubToken) {
    return NextResponse.json(
      {
        error:
          "Missing GitHub API token. Set GITHUB_TOKEN (or GH_TOKEN) for backfill sync.",
      },
      { status: 500 },
    );
  }

  let requestBody: SyncRequestBody = {};
  const rawBody = await request.text();
  if (rawBody.trim().length > 0) {
    try {
      requestBody = JSON.parse(rawBody) as SyncRequestBody;
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid JSON body. Expected optional shape: { repos?: string[], perRepoLimit?: number }",
        },
        { status: 400 },
      );
    }
  }

  const repos = resolveRepoList(requestBody.repos);
  if (repos.length === 0) {
    return NextResponse.json(
      {
        error:
          "No repositories configured. Provide repos in request body or set GITHUB_REPOS_JSON / GITHUB_REPOS_CSV.",
      },
      { status: 400 },
    );
  }

  const perRepoLimit = resolvePerRepoLimit(requestBody.perRepoLimit);

  logEvent("info", "github.sync.started", {
    repo_count: repos.length,
    per_repo_limit: perRepoLimit,
  });

  const supabase = createSupabaseAdminClient();
  const repoErrors: Array<{ repository: string; error: string }> = [];
  const runErrors: Array<{ repository: string; run_id: number | null; error: string }> = [];
  const ingested: Array<{
    repository: string;
    run_id: number;
    run_attempt: number;
    environment: DeploymentEnvironment;
    status: DeploymentStatus;
    tribe: string;
    branch: string;
    jobs_ingested: number;
  }> = [];
  let jobIngestedCount = 0;

  await mapWithConcurrency(repos, 3, async (repository) => {
    try {
      const runs = await fetchWorkflowRuns(repository, githubToken, perRepoLimit);

      await mapWithConcurrency(runs, 4, async (run) => {
        try {
          const tribe = await resolveTribeForRepository(supabase, repository);
          const record = normalizeSyncWorkflowRun(repository, run, tribe);
          const deliveryId = `sync:${repository}:${record.runId}:${record.runAttempt}`;

          await upsertRawWorkflowEvent(supabase, {
            deliveryId,
            eventName: record.eventName,
            action: record.action,
            repository,
            payload: buildSyncWorkflowRunPayload(repository, record, run),
            signatureValid: true,
          });
          await upsertWorkflowRunRecord(supabase, record);
          await upsertDeploymentForWorkflowRun(supabase, record);

          await writeWorkflowAuditEvent(supabase, {
            warnEventName: "github.sync.run_audit_write_failed",
            event: {
              eventType: "workflow_run.synced",
              source: "github-sync",
              actor: "sync-endpoint",
              actorType: "sync",
              repository,
              tribe,
              branch: record.branch,
              environment: record.environment,
              runId: record.runId,
              runAttempt: record.runAttempt,
              details: {
                status: record.status,
                run_url: record.runUrl || null,
              },
            },
          });

          const jobs = await fetchWorkflowJobs(repository, record.runId, githubToken);
          const normalizedJobs = jobs
            .map((job) =>
              normalizeWorkflowJob({
                repository,
                runId: record.runId,
                runAttempt: record.runAttempt,
                tribe,
                branch: record.branch,
                environment: record.environment,
                job,
              }),
            )
            .filter((job) => job !== null);
          const jobsIngested = await upsertWorkflowJobs(supabase, normalizedJobs);

          jobIngestedCount += jobsIngested;

          await writeWorkflowAuditEvent(supabase, {
            warnEventName: "github.sync.jobs_audit_write_failed",
            event: {
              eventType: "workflow_jobs.synced",
              source: "github-sync",
              actor: "sync-endpoint",
              actorType: "sync",
              repository,
              tribe,
              branch: record.branch,
              environment: record.environment,
              runId: record.runId,
              runAttempt: record.runAttempt,
              details: {
                job_count: jobsIngested,
              },
            },
          });

          ingested.push({
            repository,
            run_id: record.runId,
            run_attempt: record.runAttempt,
            environment: record.environment,
            status: record.status,
            tribe,
            branch: record.branch,
            jobs_ingested: jobsIngested,
          });
        } catch (error) {
          logEvent("warn", "github.sync.run_failed", {
            repository,
            run_id: run.id ?? null,
            details: error instanceof Error ? error.message : "Unknown run ingestion error",
          });
          runErrors.push({
            repository,
            run_id: run.id ?? null,
            error: error instanceof Error ? error.message : "Unknown run ingestion error",
          });
        }
      });
    } catch (error) {
      logEvent("warn", "github.sync.repository_failed", {
        repository,
        details: error instanceof Error ? error.message : "Unknown repository sync error",
      });
      repoErrors.push({
        repository,
        error: error instanceof Error ? error.message : "Unknown repository sync error",
      });
    }
  });

  if (ingested.length > 0) {
    revalidatePath("/");
  }

  const statusCode = repoErrors.length > 0 || runErrors.length > 0 ? 207 : 200;

  logEvent("info", "github.sync.completed", {
    repos_requested: repos.length,
    ingested_count: ingested.length,
    job_ingested_count: jobIngestedCount,
    repo_error_count: repoErrors.length,
    run_error_count: runErrors.length,
    status_code: statusCode,
  });

  return NextResponse.json(
    {
      ok: repoErrors.length === 0 && runErrors.length === 0,
      repos_requested: repos.length,
      per_repo_limit: perRepoLimit,
      ingested_count: ingested.length,
      job_ingested_count: jobIngestedCount,
      repo_error_count: repoErrors.length,
      run_error_count: runErrors.length,
      repo_errors: repoErrors,
      run_errors: runErrors,
      sample: ingested.slice(0, 10),
    },
    { status: statusCode },
  );
}
