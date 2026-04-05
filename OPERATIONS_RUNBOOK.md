# Operations Runbook

This runbook covers the two highest-frequency operational flows:

1. Login callback failures.
2. GitHub workflow ingestion replay and verification.

## Login Failures

Control Tower redirects failed login callbacks to `/auth/login` or `/auth/denied` with an error/reason code.
Use the code to triage quickly.

### Login Error Codes

| Location | Code | Meaning | Primary Fix |
| --- | --- | --- | --- |
| `/auth/login?error=missing_oauth_code` | `missing_oauth_code` | OAuth callback did not include `code`. | Verify GitHub OAuth app callback URL and Supabase redirect allow-list. |
| `/auth/login?error=oauth_exchange_failed` | `oauth_exchange_failed` | Supabase could not exchange the OAuth code for a session. | Verify provider setup in Supabase and `NEXT_PUBLIC_SITE_URL` / redirect URLs. |
| `/auth/login?error=org_policy_misconfigured` | `org_policy_misconfigured` | Org policy is enabled but no org list is configured. | Set `GITHUB_ALLOWED_ORG` or disable `GITHUB_REQUIRE_ORG_MEMBERSHIP`. |
| `/auth/login?error=github_scope_missing` | `github_scope_missing` | OAuth token lacks GitHub scopes required for org/team checks. | Add `read:org` to `NEXT_PUBLIC_GITHUB_OAUTH_SCOPES`, re-authorize login. |
| `/auth/login?error=org_membership_required` | `org_membership_required` | User is not a member of any required org. | Add user to allowed org or update `GITHUB_ALLOWED_ORG`. |
| `/auth/login?error=org_check_failed` | `org_check_failed` | GitHub org membership lookup failed unexpectedly. | Check GitHub API availability and token status. |
| `/auth/login?error=membership_map_misconfigured` | `membership_map_misconfigured` | JSON in membership map env vars is invalid. | Fix JSON in `GITHUB_USER_TRIBE_ROLE_MAP_JSON` / `GITHUB_TEAM_TRIBE_ROLE_MAP_JSON`. |
| `/auth/denied?reason=membership_check_failed` | `membership_check_failed` | Membership sync write/check failed. | Verify `user_tribe_membership` table and service key permissions. |
| `/auth/denied?reason=membership_table_unavailable` | `membership_table_unavailable` | Membership table query failed. | Re-run `supabase/schema.sql`; confirm table exists. |
| `/auth/denied?reason=tribe_membership_required` | `tribe_membership_required` | User has no active tribe mapping. | Seed `user_tribe_membership` or configure auto-sync mappings. |

### Login Triage Checklist

1. Confirm environment variables match `.env.example`.
2. Confirm `NEXT_PUBLIC_GITHUB_OAUTH_SCOPES` contains `read:org` when org/team checks are enabled.
3. Validate membership mapping JSON with a parser before deployment.
4. Verify `public.user_tribe_membership` exists and has active rows for target users.

## Ingestion Replay and Verification

### Key Behavior

1. Workflow ingestion correlates deployment rows by `(repository, run_id, run_attempt)`.
2. Raw webhook/sync payloads are written to `github_webhook_events`.
3. Normalized run/job telemetry is written to `workflow_runs` and `workflow_jobs`.

### Operational Log Events

Control Tower emits structured JSON logs with these event names.

- `github.webhook.signature_invalid`
- `github.webhook.workflow_run.received`
- `github.webhook.workflow_run.ingested`
- `github.webhook.workflow_run.failed`
- `github.webhook.audit_write_failed`
- `github.sync.started`
- `github.sync.run_failed`
- `github.sync.repository_failed`
- `github.sync.run_audit_write_failed`
- `github.sync.jobs_audit_write_failed`
- `github.sync.completed`

### Replay Procedure

1. Verify `INGESTION_TOKEN` and `GITHUB_TOKEN` are set in runtime env.
2. Run replay request:

```bash
curl -X POST "https://<your-domain>/api/ingestion/github/workflow-runs/sync" \
  -H "Content-Type: application/json" \
  -H "x-ingestion-token: <INGESTION_TOKEN>" \
  -d '{"repos":["ImplementSprint/central-workflow"],"perRepoLimit":25}'
```

3. Inspect response summary fields: `ingested_count`, `job_ingested_count`, `repo_errors`, `run_errors`.
4. Verify logs include `github.sync.completed` and no critical failures.
5. Validate run linkage in Supabase:

```sql
select repository, run_id, run_attempt, status, updated_at
from public.deployments
where repository = 'ImplementSprint/central-workflow'
order by updated_at desc
limit 20;
```

### Duplicate Prevention Check

Re-run the same sync request and verify deployment row count does not grow for unchanged runs.
Rows should update in place by run identity.
