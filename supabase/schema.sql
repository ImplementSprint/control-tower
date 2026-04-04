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
