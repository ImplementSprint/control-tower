import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createAuditEvent,
  resolveTribeForRepository,
} from "@/lib/control-tower/governance";
import type {
  DeploymentEnvironment,
  DeploymentStatus,
} from "@/lib/supabase/types";

type GitHubWorkflowRun = {
  id?: number;
  run_attempt?: number;
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  html_url?: string | null;
  head_branch?: string | null;
  head_sha?: string | null;
  run_started_at?: string | null;
  updated_at?: string | null;
  event?: string | null;
};

type GitHubWorkflowJob = {
  id?: number;
  run_id?: number;
  run_attempt?: number;
  name?: string | null;
  status?: string | null;
  conclusion?: string | null;
  html_url?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type SyncRequestBody = {
  repos?: string[];
  perRepoLimit?: number;
};

function getBranchEnvironment(branch: string): DeploymentEnvironment {
  if (branch === "main") {
    return "main";
  }

  if (branch === "uat") {
    return "uat";
  }

  return "test";
}

function resolveDeploymentStatus(
  status: string,
  conclusion: string,
): DeploymentStatus {
  if (status === "in_progress") {
    return "running";
  }

  if (
    status === "queued" ||
    status === "requested" ||
    status === "waiting" ||
    status === "pending"
  ) {
    return "queued";
  }

  if (status === "completed") {
    if (conclusion === "success") {
      return "success";
    }

    if (conclusion === "cancelled" || conclusion === "skipped") {
      return "cancelled";
    }

    return "failed";
  }

  return "queued";
}

function calculateDurationSeconds(
  startedAt: string | null | undefined,
  updatedAt: string | null | undefined,
) {
  if (!startedAt || !updatedAt) {
    return null;
  }

  const startTimestamp = Date.parse(startedAt);
  const endTimestamp = Date.parse(updatedAt);

  if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
    return null;
  }

  return Math.max(0, Math.round((endTimestamp - startTimestamp) / 1000));
}

function resolveAction(status: string) {
  if (status === "completed") {
    return "completed";
  }

  if (status === "in_progress") {
    return "in_progress";
  }

  return "requested";
}

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

async function fetchWorkflowRuns(
  repository: string,
  token: string,
  perRepoLimit: number,
) {
  const url = new URL(`https://api.github.com/repos/${repository}/actions/runs`);
  url.searchParams.set("per_page", String(perRepoLimit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `GitHub API request failed for ${repository} (${response.status}): ${responseText.slice(0, 240)}`,
    );
  }

  const payload = (await response.json()) as { workflow_runs?: GitHubWorkflowRun[] };
  return payload.workflow_runs ?? [];
}

async function fetchWorkflowJobs(
  repository: string,
  runId: number,
  token: string,
) {
  const jobs: GitHubWorkflowJob[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(
      `https://api.github.com/repos/${repository}/actions/runs/${runId}/jobs`,
    );
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `GitHub jobs API request failed for ${repository} run ${runId} (${response.status}): ${responseText.slice(0, 240)}`,
      );
    }

    const payload = (await response.json()) as { jobs?: GitHubWorkflowJob[] };
    const pageJobs = payload.jobs ?? [];
    jobs.push(...pageJobs);

    if (pageJobs.length < 100) {
      break;
    }
  }

  return jobs;
}

async function upsertWorkflowJobsFromSync(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    repository: string;
    runId: number;
    runAttempt: number;
    tribe: string;
    branch: string;
    environment: DeploymentEnvironment;
    jobs: GitHubWorkflowJob[];
  },
) {
  let upsertedCount = 0;

  for (const job of input.jobs) {
    if (!job.id) {
      continue;
    }

    const jobStatus = (job.status ?? "").toLowerCase();
    const jobConclusion = (job.conclusion ?? "").toLowerCase();
    const status = resolveDeploymentStatus(jobStatus, jobConclusion);
    const completedAt = jobStatus === "completed" ? job.completed_at ?? null : null;
    const durationSeconds = calculateDurationSeconds(job.started_at, job.completed_at);

    const { error } = await supabase.from("workflow_jobs").upsert(
      {
        repository: input.repository,
        run_id: input.runId,
        run_attempt: input.runAttempt,
        job_id: job.id,
        name: job.name ?? `Job ${job.id}`,
        tribe: input.tribe,
        branch: input.branch,
        environment: input.environment,
        status,
        github_status: jobStatus || null,
        github_conclusion: jobConclusion || null,
        run_url: job.html_url ?? null,
        started_at: job.started_at ?? null,
        completed_at: completedAt,
        duration_seconds: durationSeconds,
      },
      { onConflict: "repository,job_id" },
    );

    if (error) {
      throw new Error(`Failed to upsert workflow job ${job.id}: ${error.message}`);
    }

    upsertedCount += 1;
  }

  return upsertedCount;
}

async function upsertWorkflowRunFromSync(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  repository: string,
  run: GitHubWorkflowRun,
) {
  if (!run.id) {
    throw new Error("GitHub workflow run is missing id.");
  }

  const branch = run.head_branch ?? "test";
  const environment = getBranchEnvironment(branch);
  const runStatus = (run.status ?? "").toLowerCase();
  const runConclusion = (run.conclusion ?? "").toLowerCase();
  const action = resolveAction(runStatus);
  const status = resolveDeploymentStatus(runStatus, runConclusion);
  const runAttempt =
    typeof run.run_attempt === "number" && run.run_attempt > 0 ? run.run_attempt : 1;
  const runIdTag = `run_id:${run.id}:attempt:${runAttempt}`;
  const runUrl = run.html_url ?? "";
  const workflowName = run.name ?? "Workflow";
  const durationSeconds = calculateDurationSeconds(run.run_started_at, run.updated_at);
  const tribe = await resolveTribeForRepository(supabase, repository);
  const summary = `[tribe:${tribe}] ${workflowName} ${status} (${runIdTag})${runUrl ? ` ${runUrl}` : ""}`.slice(
    0,
    500,
  );
  const completedAt = runStatus === "completed" ? run.updated_at ?? null : null;
  const deliveryId = `sync:${repository}:${run.id}:${runAttempt}`;

  const rawPayload = {
    action,
    repository: {
      full_name: repository,
    },
    workflow_run: run,
  };

  const { error: rawEventError } = await supabase.from("github_webhook_events").upsert(
    {
      delivery_id: deliveryId,
      event_name: "workflow_run_sync",
      action,
      repository,
      payload: rawPayload,
      signature_valid: true,
    },
    { onConflict: "delivery_id" },
  );

  if (rawEventError) {
    throw new Error(`Failed to store sync raw event: ${rawEventError.message}`);
  }

  const { error: workflowRunUpsertError } = await supabase.from("workflow_runs").upsert(
    {
      repository,
      run_id: run.id,
      run_attempt: runAttempt,
      workflow_name: workflowName,
      branch,
      environment,
      tribe,
      status,
      github_status: runStatus || null,
      github_conclusion: runConclusion || null,
      event_name: "workflow_run_sync",
      action,
      run_url: runUrl || null,
      commit_sha: run.head_sha ?? null,
      started_at: run.run_started_at ?? null,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
    },
    { onConflict: "repository,run_id,run_attempt" },
  );

  if (workflowRunUpsertError) {
    throw new Error(`Failed to upsert workflow run: ${workflowRunUpsertError.message}`);
  }

  let lookupQuery = supabase
    .from("deployments")
    .select("id")
    .eq("repository", repository)
    .ilike("summary", `%${runIdTag}%`)
    .limit(1);

  if (run.head_sha) {
    lookupQuery = lookupQuery.eq("commit_sha", run.head_sha);
  }

  const { data: existingRow, error: lookupError } = await lookupQuery.maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to lookup deployment summary row: ${lookupError.message}`);
  }

  if (existingRow?.id) {
    const { error: updateError } = await supabase
      .from("deployments")
      .update({
        status,
        summary,
        duration_seconds: durationSeconds,
      })
      .eq("id", existingRow.id);

    if (updateError) {
      throw new Error(`Failed to update deployment summary row: ${updateError.message}`);
    }
  } else {
    const { error: insertError } = await supabase.from("deployments").insert({
      repository,
      branch,
      environment,
      status,
      summary,
      commit_sha: run.head_sha ?? null,
      duration_seconds: durationSeconds,
    });

    if (insertError) {
      throw new Error(`Failed to insert deployment summary row: ${insertError.message}`);
    }
  }

  try {
    await createAuditEvent(supabase, {
      eventType: "workflow_run.synced",
      source: "github-sync",
      actor: "sync-endpoint",
      actorType: "sync",
      repository,
      tribe,
      branch,
      environment,
      runId: run.id,
      runAttempt: runAttempt,
      details: {
        status,
        run_url: runUrl || null,
      },
    });
  } catch {
    // Keep backfill resilient if audit write fails.
  }

  return {
    repository,
    run_id: run.id,
    run_attempt: runAttempt,
    environment,
    status,
    tribe,
    branch,
  };
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

  const perRepoLimitRaw = Number(requestBody.perRepoLimit ?? 20);
  const perRepoLimit = Number.isFinite(perRepoLimitRaw)
    ? Math.min(Math.max(Math.trunc(perRepoLimitRaw), 1), 100)
    : 20;

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

  for (const repository of repos) {
    try {
      const runs = await fetchWorkflowRuns(repository, githubToken, perRepoLimit);

      for (const run of runs) {
        try {
          const record = await upsertWorkflowRunFromSync(supabase, repository, run);
          const jobs = await fetchWorkflowJobs(repository, record.run_id, githubToken);
          const jobsIngested = await upsertWorkflowJobsFromSync(supabase, {
            repository,
            runId: record.run_id,
            runAttempt: record.run_attempt,
            tribe: record.tribe,
            branch: record.branch,
            environment: record.environment,
            jobs,
          });

          jobIngestedCount += jobsIngested;

          try {
            await createAuditEvent(supabase, {
              eventType: "workflow_jobs.synced",
              source: "github-sync",
              actor: "sync-endpoint",
              actorType: "sync",
              repository,
              tribe: record.tribe,
              branch: record.branch,
              environment: record.environment,
              runId: record.run_id,
              runAttempt: record.run_attempt,
              details: {
                job_count: jobsIngested,
              },
            });
          } catch {
            // Keep backfill resilient if audit write fails.
          }

          ingested.push({
            ...record,
            jobs_ingested: jobsIngested,
          });
        } catch (error) {
          runErrors.push({
            repository,
            run_id: run.id ?? null,
            error: error instanceof Error ? error.message : "Unknown run ingestion error",
          });
        }
      }
    } catch (error) {
      repoErrors.push({
        repository,
        error: error instanceof Error ? error.message : "Unknown repository sync error",
      });
    }
  }

  if (ingested.length > 0) {
    revalidatePath("/");
  }

  const statusCode = repoErrors.length > 0 || runErrors.length > 0 ? 207 : 200;

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
