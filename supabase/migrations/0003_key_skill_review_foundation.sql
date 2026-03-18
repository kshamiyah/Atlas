-- 1) Review entries (normalized source entries for attribution)
create table if not exists key_skill_review_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_system text not null check (source_system in ('kaizen', 'generated')),
  source_entry_key text not null,
  title text not null default '',
  entry_type text not null default '',
  linked_cip_number integer not null check (linked_cip_number between 1 and 14),
  event_date date,
  entry_text text not null default '',
  stage_id uuid references stages(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (user_id, source_system, source_entry_key)
);

-- 2) Suggestions / attributions
create table if not exists key_skill_review_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_entry_id uuid not null references key_skill_review_entries(id) on delete cascade,
  key_skill_id uuid not null references key_skills(id) on delete cascade,
  suggestion_source text not null check (suggestion_source in ('linked_cip', 'cross_cip')),
  method text not null check (method in ('rule', 'ai', 'user')),
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  rationale text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (review_entry_id, key_skill_id, suggestion_source)
);

-- 3) timestamps
create or replace function key_skill_review_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_key_skill_review_entries_updated_at on key_skill_review_entries;
create trigger trg_key_skill_review_entries_updated_at
before update on key_skill_review_entries
for each row execute function key_skill_review_set_updated_at();

drop trigger if exists trg_key_skill_review_suggestions_updated_at on key_skill_review_suggestions;
create trigger trg_key_skill_review_suggestions_updated_at
before update on key_skill_review_suggestions
for each row execute function key_skill_review_set_updated_at();

-- 4) indexes
create index if not exists idx_ksr_entries_user_seen
  on key_skill_review_entries(user_id, last_seen_at desc);

create index if not exists idx_ksr_suggestions_user_status
  on key_skill_review_suggestions(user_id, status, suggestion_source);

create index if not exists idx_ksr_suggestions_entry
  on key_skill_review_suggestions(review_entry_id);

-- 5) RLS
alter table key_skill_review_entries enable row level security;
alter table key_skill_review_suggestions enable row level security;

create policy "Users can only see own key skill review entries"
  on key_skill_review_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only see own key skill review suggestions"
  on key_skill_review_suggestions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

