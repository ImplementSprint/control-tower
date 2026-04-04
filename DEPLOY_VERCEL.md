# Deploy to Vercel

This application is a single Next.js fullstack app. Deploy it directly to Vercel.

## 1) Import the Repository

1. Go to Vercel and create a new project.
2. Import this repository.
3. Keep Root Directory as repository root.
4. Framework preset should auto-detect as Next.js.

## 2) Configure Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- GITHUB_WEBHOOK_SECRET
- TRIBE_REPO_MAP_JSON (optional)
- INGESTION_TOKEN
- GITHUB_TOKEN (or GH_TOKEN)
- GITHUB_REPOS_JSON or GITHUB_REPOS_CSV (optional)

Notes:

- NEXT_PUBLIC_* variables are exposed to browser code.
- SUPABASE_SERVICE_ROLE_KEY is server-only and must never be exposed to client components.

## 3) Build Settings

- Install Command: npm install
- Build Command: npm run build
- Output: Next.js default

## 4) Database Initialization

Before first production use, run SQL from supabase/schema.sql in Supabase SQL editor.

If your deployment was already initialized earlier, run schema.sql again to apply telemetry tables (`workflow_runs`, `github_webhook_events`, `repo_tribe_map`).
Latest schema also includes `workflow_jobs`, `policy_rules`, and `audit_events` for governance and gate-level telemetry.

## 5) Verify Deployment

After deploy:

1. Open the root page.
2. Create a deployment record from the form.
3. Confirm record appears in Recent Deployments.

If data does not load, verify Supabase environment variables and schema setup.

## 6) GitHub Webhook

Set repository webhook in GitHub:

- Payload URL: https://<your-project>.vercel.app/api/webhooks/github/workflow-run
- Content type: application/json
- Secret: same value as GITHUB_WEBHOOK_SECRET
- SSL: Enable verification
- Event: Workflow runs

After setup, trigger a workflow run and confirm new entries appear in the dashboard.

You can also verify normalized ingestion via:

- GET https://<your-project>.vercel.app/api/workflow-runs
- GET https://<your-project>.vercel.app/api/workflow-jobs
- GET https://<your-project>.vercel.app/api/metrics/tribes
- GET https://<your-project>.vercel.app/api/audit-events

## 7) Backfill Sync (Missed Webhooks)

POST endpoint:

- https://<your-project>.vercel.app/api/ingestion/github/workflow-runs/sync

Required header:

- x-ingestion-token: <INGESTION_TOKEN>

Optional JSON body:

```json
{
	"repos": ["ImplementSprint/central-workflow"],
	"perRepoLimit": 25
}
```
