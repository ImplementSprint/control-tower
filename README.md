# Control Tower

Fullstack Next.js application designed for Vercel deployment, using shadcn/ui for UI and Supabase for database storage.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui components
- Supabase (Postgres)

## Features

- Dashboard metrics for deployments
- GitHub OAuth login with optional organization restriction
- Tribe-scoped read visibility (users only see assigned tribes)
- Admin-only deployment create/update overrides
- Supabase-backed persistence with typed validation
- Normalized workflow run and job ingestion from GitHub Actions
- Policy rules + immutable audit event APIs

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Set values in .env.local:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SITE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- GITHUB_REQUIRE_ORG_MEMBERSHIP (default `false`)
- NEXT_PUBLIC_GITHUB_OAUTH_SCOPES (default `user:email`)
- NEXT_PUBLIC_GITHUB_REQUIRE_ORG_MEMBERSHIP (default `false`)
- GITHUB_ALLOWED_ORG (optional, comma-separated; required only when org gate is enabled)
- GITHUB_WEBHOOK_SECRET (for GitHub webhook signature verification)
- TRIBE_REPO_MAP_JSON (optional explicit repo-to-tribe mapping)
- INGESTION_TOKEN (required to protect sync endpoint)
- GITHUB_TOKEN (or GH_TOKEN) for GitHub Actions API backfill
- GITHUB_REPOS_JSON or GITHUB_REPOS_CSV (optional default repo list)

Compatibility notes:
1. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also accepted.
2. `SUPABASE_SERVICE_ROLE_KEY` is also accepted as a legacy alias for `SUPABASE_SECRET_KEY`.

Auth + access notes:
1. Sign-in is via GitHub OAuth at `/auth/login`.
2. OAuth uses `NEXT_PUBLIC_GITHUB_OAUTH_SCOPES` (minimal default: `user:email`).
3. Org-based gating is enabled automatically when `GITHUB_ALLOWED_ORG` is set (or explicitly via `GITHUB_REQUIRE_ORG_MEMBERSHIP=true`).
4. When org gating is enabled, include `read:org` in `NEXT_PUBLIC_GITHUB_OAUTH_SCOPES`.
5. When org gating is disabled (default), login uses minimal scopes and no org membership checks.
5. Tribe access is controlled by `user_tribe_membership` rows.
6. Deployment create/update APIs are reserved for `platform_admin` users.

Recommended hardening path:
1. Keep OAuth scopes minimal for identity (`user:email`) unless org policy requires `read:org`.
2. Prefer tribe/user membership controls for day-to-day authorization.
3. For enterprise org controls, migrate to a GitHub App model for org-level governance and keep OAuth focused on user identity.

Tribe ownership resolution order:
1. `TRIBE_REPO_MAP_JSON` explicit mapping.
2. `repo_tribe_map` table rows where `is_active = true`.
3. Naming convention fallback from repository name: `tribename-fe`, `tribename-be`, or `tribename-mobile` maps to tribe `tribename`.
4. When fallback returns a concrete tribe, Control Tower upserts that mapping into `repo_tribe_map` (for both full `org/repo` and short repo key) so next requests resolve from the table.

4. Create the database table in Supabase SQL editor using:

- supabase/schema.sql

If you already ran schema.sql before, run it again to apply:
1. new telemetry tables used by webhook ingestion.
2. `user_tribe_membership` access table.
3. RLS policies for tribe-scoped read access.

5. Seed access mapping (example SQL):

```sql
insert into public.user_tribe_membership (user_id, tribe, role)
values
	('<supabase-auth-user-uuid>', 'cicd', 'viewer');
```

Use role `platform_admin` for admins who need override capabilities.

6. Start development server:

```bash
npm run dev
```

Open http://localhost:3000.

## API Endpoints

- GET /api/deployments
- POST /api/deployments (platform_admin only)
- PATCH /api/deployments/:id (platform_admin only)
- GET /api/workflow-runs
- GET /api/workflow-jobs
- GET /api/metrics/tribes
- GET /api/policies
- POST /api/policies
- GET /api/audit-events
- POST /api/webhooks/github/workflow-run
- POST /api/ingestion/github/workflow-runs/sync

## GitHub Webhook Setup

1. In your GitHub repository, add a webhook with payload URL:

- https://YOUR-VERCEL-DOMAIN.vercel.app/api/webhooks/github/workflow-run

2. Set content type to application/json.
3. Use the same secret value as GITHUB_WEBHOOK_SECRET.
4. Enable SSL verification.
5. Select individual event: Workflow runs.

## Backfill Sync Endpoint

Use this endpoint to reconcile missed webhook deliveries.

The sync route now ingests both workflow runs and workflow jobs (gate-level records).

Example request:

```bash
curl -X POST "https://YOUR-VERCEL-DOMAIN.vercel.app/api/ingestion/github/workflow-runs/sync" \
	-H "Content-Type: application/json" \
	-H "x-ingestion-token: YOUR_INGESTION_TOKEN" \
	-d '{"repos":["ImplementSprint/central-workflow"],"perRepoLimit":25}'
```

## Vercel Deployment

See DEPLOY_VERCEL.md for a production deployment checklist.
