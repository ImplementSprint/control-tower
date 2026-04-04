create extension if not exists pgcrypto;

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  repository text not null,
  branch text not null,
  environment text not null check (environment in ('test', 'uat', 'main')),
  status text not null check (status in ('queued', 'running', 'success', 'failed', 'cancelled')),
  summary text,
  commit_sha text,
  duration_seconds integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists deployments_created_at_idx on public.deployments (created_at desc);
create index if not exists deployments_repo_idx on public.deployments (repository);
create index if not exists deployments_status_idx on public.deployments (status);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists deployments_set_updated_at on public.deployments;
create trigger deployments_set_updated_at
before update on public.deployments
for each row
execute function public.set_updated_at_timestamp();

alter table public.deployments enable row level security;

-- Service role bypasses RLS. Keep read access private by default.

create table if not exists public.repo_tribe_map (
  repository text primary key,
  tribe text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.github_webhook_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique,
  event_name text not null,
  action text,
  repository text,
  payload jsonb not null,
  signature_valid boolean not null default true,
  received_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  repository text not null,
  run_id bigint not null,
  run_attempt integer not null default 1,
  workflow_name text,
  branch text not null,
  environment text not null check (environment in ('test', 'uat', 'main')),
  tribe text not null,
  status text not null check (status in ('queued', 'running', 'success', 'failed', 'cancelled')),
  github_status text,
  github_conclusion text,
  event_name text not null,
  action text,
  run_url text,
  commit_sha text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (repository, run_id, run_attempt)
);

create table if not exists public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  repository text not null,
  run_id bigint not null,
  run_attempt integer not null default 1,
  job_id bigint not null,
  name text not null,
  tribe text not null,
  branch text not null,
  environment text not null check (environment in ('test', 'uat', 'main')),
  status text not null check (status in ('queued', 'running', 'success', 'failed', 'cancelled')),
  github_status text,
  github_conclusion text,
  run_url text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (repository, job_id)
);

create index if not exists repo_tribe_map_tribe_idx on public.repo_tribe_map (tribe);
create index if not exists github_webhook_events_event_idx on public.github_webhook_events (event_name, received_at desc);
create index if not exists github_webhook_events_repository_idx on public.github_webhook_events (repository);
create index if not exists workflow_runs_repository_idx on public.workflow_runs (repository);
create index if not exists workflow_runs_tribe_idx on public.workflow_runs (tribe);
create index if not exists workflow_runs_branch_idx on public.workflow_runs (branch);
create index if not exists workflow_runs_status_idx on public.workflow_runs (status);
create index if not exists workflow_runs_completed_idx on public.workflow_runs (completed_at desc);
create index if not exists workflow_jobs_repository_idx on public.workflow_jobs (repository);
create index if not exists workflow_jobs_run_idx on public.workflow_jobs (repository, run_id, run_attempt);
create index if not exists workflow_jobs_tribe_idx on public.workflow_jobs (tribe);
create index if not exists workflow_jobs_status_idx on public.workflow_jobs (status);
create index if not exists workflow_jobs_completed_idx on public.workflow_jobs (completed_at desc);

drop trigger if exists repo_tribe_map_set_updated_at on public.repo_tribe_map;
create trigger repo_tribe_map_set_updated_at
before update on public.repo_tribe_map
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists workflow_runs_set_updated_at on public.workflow_runs;
create trigger workflow_runs_set_updated_at
before update on public.workflow_runs
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists workflow_jobs_set_updated_at on public.workflow_jobs;
create trigger workflow_jobs_set_updated_at
before update on public.workflow_jobs
for each row
execute function public.set_updated_at_timestamp();

alter table public.repo_tribe_map enable row level security;
alter table public.github_webhook_events enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_jobs enable row level security;

create table if not exists public.policy_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rule_type text not null check (rule_type in ('block_environment', 'block_status', 'require_summary_on_status')),
  repository text,
  tribe text,
  environment text check (environment in ('test', 'uat', 'main')),
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  source text not null,
  actor text,
  actor_type text not null default 'system' check (actor_type in ('system', 'user', 'webhook', 'sync')),
  repository text,
  tribe text,
  branch text,
  environment text check (environment in ('test', 'uat', 'main')),
  deployment_id uuid references public.deployments(id) on delete set null,
  run_id bigint,
  run_attempt integer,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists policy_rules_enabled_idx on public.policy_rules (is_enabled);
create index if not exists policy_rules_scope_idx on public.policy_rules (repository, tribe, environment);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists audit_events_repository_idx on public.audit_events (repository);
create index if not exists audit_events_tribe_idx on public.audit_events (tribe);
create index if not exists audit_events_type_idx on public.audit_events (event_type);

drop trigger if exists policy_rules_set_updated_at on public.policy_rules;
create trigger policy_rules_set_updated_at
before update on public.policy_rules
for each row
execute function public.set_updated_at_timestamp();

alter table public.policy_rules enable row level security;
alter table public.audit_events enable row level security;
