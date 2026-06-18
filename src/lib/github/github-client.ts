export type GitHubWorkflowRun = {
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

export type GitHubWorkflowJob = {
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

export async function githubJson<T>(url: URL | string, token: string): Promise<T> {
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
      `GitHub API request failed (${response.status}) for ${String(url)}: ${responseText.slice(0, 240)}`,
    );
  }

  return (await response.json()) as T;
}

export async function fetchWorkflowRuns(
  repository: string,
  token: string,
  perRepoLimit: number,
) {
  const url = new URL(`https://api.github.com/repos/${repository}/actions/runs`);
  url.searchParams.set("per_page", String(perRepoLimit));

  const payload = await githubJson<{ workflow_runs?: GitHubWorkflowRun[] }>(url, token);
  return payload.workflow_runs ?? [];
}

export async function fetchWorkflowJobs(
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

    const payload = await githubJson<{ jobs?: GitHubWorkflowJob[] }>(url, token);
    const pageJobs = payload.jobs ?? [];
    jobs.push(...pageJobs);

    if (pageJobs.length < 100) {
      break;
    }
  }

  return jobs;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const workerCount = Math.min(Math.max(Math.trunc(concurrency), 1), items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}
