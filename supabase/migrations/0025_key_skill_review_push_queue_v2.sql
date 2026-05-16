-- Sidecar V2 queue for backend-owned pull-worker experiments.
-- This intentionally does not modify the live V1 push queue contract.

create table if not exists public.key_skill_review_push_queue_v2_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_entry_id uuid not null references public.key_skill_review_entries(id) on delete cascade,
  source_entry_key text,
  title text not null default 'Untitled entry',
  event_date text not null default '',
  entry_edit_url text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'synced', 'failed')),
  logical_change_count integer not null default 0 check (logical_change_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  claim_token uuid,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'key_skill_review_push_queue_v2_groups_user_entry_key'
      and conrelid = 'public.key_skill_review_push_queue_v2_groups'::regclass
  ) then
    alter table public.key_skill_review_push_queue_v2_groups
      add constraint key_skill_review_push_queue_v2_groups_user_entry_key
      unique (user_id, review_entry_id);
  end if;
end
$$;

create unique index if not exists idx_ksr_push_queue_v2_groups_user_source
  on public.key_skill_review_push_queue_v2_groups(user_id, source_entry_key)
  where source_entry_key is not null;

create index if not exists idx_ksr_push_queue_v2_groups_user_status
  on public.key_skill_review_push_queue_v2_groups(user_id, status, updated_at desc);

create index if not exists idx_ksr_push_queue_v2_groups_entry
  on public.key_skill_review_push_queue_v2_groups(review_entry_id);

drop trigger if exists trg_key_skill_review_push_queue_v2_groups_updated_at
  on public.key_skill_review_push_queue_v2_groups;

create trigger trg_key_skill_review_push_queue_v2_groups_updated_at
before update on public.key_skill_review_push_queue_v2_groups
for each row execute function public.key_skill_review_set_updated_at();

alter table public.key_skill_review_push_queue_v2_groups enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'key_skill_review_push_queue_v2_groups'
      and policyname = 'Users can only see own key skill push queue v2 groups'
  ) then
    create policy "Users can only see own key skill push queue v2 groups"
      on public.key_skill_review_push_queue_v2_groups
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

create table if not exists public.key_skill_review_push_queue_v2_jobs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.key_skill_review_push_queue_v2_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  review_entry_id uuid not null references public.key_skill_review_entries(id) on delete cascade,
  source_v1_queue_id uuid unique references public.key_skill_review_push_queue(id) on delete set null,
  suggestion_id uuid references public.key_skill_review_suggestions(id) on delete set null,
  key_skill_id uuid not null references public.key_skills(id) on delete cascade,
  key_skill_title text not null default '',
  cip_number integer not null default 0,
  kaizen_id text,
  kaizen_ids jsonb not null default '[]'::jsonb,
  display_value text not null default '',
  action_type text not null default 'add'
    check (action_type in ('add', 'remove', 'replace_remove', 'replace_add')),
  action_group_id uuid,
  sequence_index integer,
  kaizen_skill_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'synced', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  claim_token uuid,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  queued_at timestamptz not null default timezone('utc', now()),
  last_attempt_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ksr_push_queue_v2_jobs_group
  on public.key_skill_review_push_queue_v2_jobs(group_id, sequence_index nulls last, created_at asc);

create index if not exists idx_ksr_push_queue_v2_jobs_user_status
  on public.key_skill_review_push_queue_v2_jobs(user_id, status, updated_at desc);

drop trigger if exists trg_key_skill_review_push_queue_v2_jobs_updated_at
  on public.key_skill_review_push_queue_v2_jobs;

create trigger trg_key_skill_review_push_queue_v2_jobs_updated_at
before update on public.key_skill_review_push_queue_v2_jobs
for each row execute function public.key_skill_review_set_updated_at();

alter table public.key_skill_review_push_queue_v2_jobs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'key_skill_review_push_queue_v2_jobs'
      and policyname = 'Users can only see own key skill push queue v2 jobs'
  ) then
    create policy "Users can only see own key skill push queue v2 jobs"
      on public.key_skill_review_push_queue_v2_jobs
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
