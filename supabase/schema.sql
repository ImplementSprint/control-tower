create extension if not exists pgcrypto;

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  repository text not null,
  branch text not null,
  environment text not null check (environment in ('test', 'uat', 'main')),
  status text not null check (status in ('queued', 'running', 'success', 'failed', 'cancelled')),
  summary text,
  commit_sha text,
  run_id bigint,
  run_attempt integer,
  duration_seconds integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.deployments
add column if not exists tribe text;

alter table public.deployments
add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.deployments
add column if not exists run_id bigint;

alter table public.deployments
add column if not exists run_attempt integer;

create index if not exists deployments_created_at_idx on public.deployments (created_at desc);
create index if not exists deployments_repo_idx on public.deployments (repository);
create index if not exists deployments_status_idx on public.deployments (status);
create index if not exists deployments_tribe_idx on public.deployments (tribe);
create unique index if not exists deployments_run_identity_uidx on public.deployments (repository, run_id, run_attempt);
create index if not exists deployments_run_identity_idx on public.deployments (run_id, run_attempt);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.get_tribe_health_metrics(
  p_window_days integer default 14,
  p_tribes text[] default null
)
returns table (
  tribe text,
  total_runs bigint,
  success_count bigint,
  failed_count bigint,
  running_count bigint,
  cancelled_count bigint,
  success_rate numeric,
  average_duration_seconds integer,
  last_completed_at timestamptz
)
language sql
stable
as $$
  with scoped_runs as (
    select
      coalesce(nullif(lower(trim(w.tribe)), ''), 'unmapped') as tribe,
      w.status,
      w.duration_seconds,
      w.completed_at
    from public.workflow_runs as w
    where w.created_at >= timezone('utc', now()) - make_interval(days => greatest(p_window_days, 1))
      and (
        p_tribes is null
        or coalesce(nullif(lower(trim(w.tribe)), ''), 'unmapped') = any(p_tribes)
      )
  )
  select
    sr.tribe,
    count(*)::bigint as total_runs,
    count(*) filter (where sr.status = 'success')::bigint as success_count,
    count(*) filter (where sr.status = 'failed')::bigint as failed_count,
    count(*) filter (where sr.status = 'running')::bigint as running_count,
    count(*) filter (where sr.status = 'cancelled')::bigint as cancelled_count,
    case
      when count(*) = 0 then 0::numeric
      else round(
        (count(*) filter (where sr.status = 'success'))::numeric
        * 100
        / count(*)::numeric,
        1
      )
    end as success_rate,
    coalesce(round(avg(sr.duration_seconds)::numeric), 0)::integer as average_duration_seconds,
    max(sr.completed_at) as last_completed_at
  from scoped_runs as sr
  group by sr.tribe
  order by total_runs desc;
$$;

create or replace function public.get_runs_timeline_metrics(
  p_window_days integer default 14,
  p_tribes text[] default null
)
returns table (
  metric_date date,
  total_runs bigint,
  success_count bigint,
  failed_count bigint,
  running_count bigint,
  cancelled_count bigint,
  average_duration_seconds integer
)
language sql
stable
as $$
  with day_series as (
    select
      generate_series(
        timezone('utc', now())::date - (greatest(p_window_days, 1) - 1),
        timezone('utc', now())::date,
        interval '1 day'
      )::date as metric_date
  ),
  scoped_runs as (
    select
      timezone('utc', w.created_at)::date as metric_date,
      w.status,
      w.duration_seconds
    from public.workflow_runs as w
    where w.created_at >= timezone('utc', now()) - make_interval(days => greatest(p_window_days, 1))
      and (
        p_tribes is null
        or coalesce(nullif(lower(trim(w.tribe)), ''), 'unmapped') = any(p_tribes)
      )
  )
  select
    ds.metric_date,
    count(sr.metric_date)::bigint as total_runs,
    count(*) filter (where sr.status = 'success')::bigint as success_count,
    count(*) filter (where sr.status = 'failed')::bigint as failed_count,
    count(*) filter (where sr.status = 'running')::bigint as running_count,
    count(*) filter (where sr.status = 'cancelled')::bigint as cancelled_count,
    coalesce(round(avg(sr.duration_seconds)::numeric), 0)::integer as average_duration_seconds
  from day_series as ds
  left join scoped_runs as sr
    on sr.metric_date = ds.metric_date
  group by ds.metric_date
  order by ds.metric_date;
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

create table if not exists public.user_tribe_membership (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tribe text not null,
  role text not null default 'viewer' check (role in ('viewer', 'lead', 'platform_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, tribe)
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
create index if not exists user_tribe_membership_user_idx on public.user_tribe_membership (user_id);
create index if not exists user_tribe_membership_tribe_idx on public.user_tribe_membership (tribe);
create index if not exists user_tribe_membership_user_active_tribe_idx on public.user_tribe_membership (user_id, is_active, tribe);
create index if not exists github_webhook_events_event_idx on public.github_webhook_events (event_name, received_at desc);
create index if not exists github_webhook_events_repository_idx on public.github_webhook_events (repository);
create index if not exists workflow_runs_repository_idx on public.workflow_runs (repository);
create index if not exists workflow_runs_tribe_idx on public.workflow_runs (tribe);
create index if not exists workflow_runs_branch_idx on public.workflow_runs (branch);
create index if not exists workflow_runs_status_idx on public.workflow_runs (status);
create index if not exists workflow_runs_completed_idx on public.workflow_runs (completed_at desc);
create index if not exists workflow_runs_completed_created_idx on public.workflow_runs (completed_at desc, created_at desc);
create index if not exists workflow_runs_tribe_created_idx on public.workflow_runs (tribe, created_at desc);
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

drop trigger if exists user_tribe_membership_set_updated_at on public.user_tribe_membership;
create trigger user_tribe_membership_set_updated_at
before update on public.user_tribe_membership
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
alter table public.user_tribe_membership enable row level security;
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
create index if not exists policy_rules_scope_enabled_idx on public.policy_rules (repository, tribe, environment)
where is_enabled = true;
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

update public.deployments as d
set tribe = m.tribe
from public.repo_tribe_map as m
where d.tribe is null
  and m.is_active = true
  and (
    m.repository = d.repository
    or m.repository = split_part(d.repository, '/', 2)
  );

drop policy if exists user_tribe_membership_read_own on public.user_tribe_membership;
create policy user_tribe_membership_read_own
on public.user_tribe_membership
for select
using (user_id = auth.uid());

drop policy if exists workflow_runs_read_scoped on public.workflow_runs;
create policy workflow_runs_read_scoped
on public.workflow_runs
for select
using (
  exists (
    select 1
    from public.user_tribe_membership as m
    where m.user_id = auth.uid()
      and m.is_active = true
      and (m.role = 'platform_admin' or m.tribe = workflow_runs.tribe)
  )
);

drop policy if exists workflow_jobs_read_scoped on public.workflow_jobs;
create policy workflow_jobs_read_scoped
on public.workflow_jobs
for select
using (
  exists (
    select 1
    from public.user_tribe_membership as m
    where m.user_id = auth.uid()
      and m.is_active = true
      and (m.role = 'platform_admin' or m.tribe = workflow_jobs.tribe)
  )
);

drop policy if exists deployments_read_scoped on public.deployments;
create policy deployments_read_scoped
on public.deployments
for select
using (
  exists (
    select 1
    from public.user_tribe_membership as m
    where m.user_id = auth.uid()
      and m.is_active = true
      and (m.role = 'platform_admin' or m.tribe = deployments.tribe)
  )
);

-- ============================================================
-- Phase 4: Notifications & Alerts
-- ============================================================

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tribe text,
  rule_type text not null check (rule_type in (
    'success_rate_below',
    'failed_run_count_above',
    'duration_above'
  )),
  threshold numeric not null,
  window_minutes integer not null default 1440,
  is_enabled boolean not null default true,
  channels jsonb not null default '["in_app"]'::jsonb,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.alert_channels (
  id uuid primary key default gen_random_uuid(),
  tribe text,
  channel_type text not null check (channel_type in ('slack_webhook', 'in_app')),
  config jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tribe text,
  title text not null,
  body text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  source_type text,
  source_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists alert_rules_tribe_idx on public.alert_rules (tribe);
create index if not exists alert_rules_enabled_idx on public.alert_rules (is_enabled);
create index if not exists alert_channels_tribe_idx on public.alert_channels (tribe);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_tribe_idx on public.notifications (tribe);

drop trigger if exists alert_rules_set_updated_at on public.alert_rules;
create trigger alert_rules_set_updated_at
before update on public.alert_rules
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists alert_channels_set_updated_at on public.alert_channels;
create trigger alert_channels_set_updated_at
before update on public.alert_channels
for each row
execute function public.set_updated_at_timestamp();

alter table public.alert_rules enable row level security;
alter table public.alert_channels enable row level security;
alter table public.notifications enable row level security;

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own
on public.notifications
for select
using (user_id = auth.uid());
