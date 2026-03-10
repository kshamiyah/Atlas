-- Curriculum reference data

create table if not exists curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_document text not null,
  effective_from date,
  created_at timestamptz default timezone('utc', now())
);

create table if not exists cips (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid references curriculum_versions(id) on delete cascade,
  number integer not null,
  title text not null,
  description text not null,
  category text not null
);

create table if not exists key_skills (
  id uuid primary key default gen_random_uuid(),
  cip_id uuid references cips(id) on delete cascade,
  skill_number integer not null,
  title text not null,
  legacy_id text
);

create table if not exists descriptors (
  id uuid primary key default gen_random_uuid(),
  key_skill_id uuid references key_skills(id) on delete cascade,
  text text not null,
  sort_order integer not null
);

create table if not exists procedures_catalog (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid references curriculum_versions(id) on delete cascade,
  name text not null,
  category text not null,
  requires_summative_osats boolean default false
);

create table if not exists stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage_group text not null,
  sort_order integer not null
);

create table if not exists stage_requirements (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid references stages(id) on delete cascade,
  cip_id uuid references cips(id) on delete cascade,
  requirement_type text not null,
  target_value text not null,
  notes text
);

create table if not exists courses_catalog (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid references curriculum_versions(id) on delete cascade,
  name text not null,
  required_by_stage text not null
);

create table if not exists exams_catalog (
  id uuid primary key default gen_random_uuid(),
  curriculum_version_id uuid references curriculum_versions(id) on delete cascade,
  name text not null,
  required_by_stage text not null,
  notes text
);

-- User / synced data (RLS protected)

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  current_stage_id uuid references stages(id),
  arcp_date date,
  deanery text,
  hospital text,
  curriculum_version_id uuid references curriculum_versions(id),
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists kaizen_sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  sync_type text not null,
  synced_at timestamptz default timezone('utc', now()),
  data_hash text
);

create table if not exists kaizen_cip_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cip_number integer not null,
  cip_title text not null,
  percentage numeric,
  status_colour text,
  synced_at timestamptz default timezone('utc', now())
);

create table if not exists kaizen_key_skill_coverage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cip_number integer not null,
  key_skill_name text not null,
  evidence_count integer,
  covered boolean not null default false,
  linked_items jsonb not null default '[]'::jsonb,
  synced_at timestamptz default timezone('utc', now())
);

create table if not exists kaizen_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  kaizen_date text not null,
  assessment_type text not null,
  title text not null,
  category text not null,
  training_year text not null,
  status text not null,
  key_skills_count integer,
  synced_at timestamptz default timezone('utc', now())
);

create table if not exists kaizen_assessment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  direction text not null,
  other_party_name text not null,
  entry_title text not null,
  status text not null,
  date text not null,
  synced_at timestamptz default timezone('utc', now())
);

create table if not exists kaizen_supervisor_meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date text not null,
  title text not null,
  meeting_type text not null,
  supervisor_name text not null,
  synced_at timestamptz default timezone('utc', now())
);

create table if not exists generated_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  entry_type text not null,
  raw_input text not null,
  structured_data jsonb not null,
  suggested_key_skills jsonb,
  stage_id uuid references stages(id),
  pushed_to_kaizen boolean default false,
  pushed_at timestamptz,
  created_at timestamptz default timezone('utc', now())
);

-- RLS

alter table profiles enable row level security;
alter table kaizen_sync_log enable row level security;
alter table kaizen_cip_progress enable row level security;
alter table kaizen_key_skill_coverage enable row level security;
alter table kaizen_entries enable row level security;
alter table kaizen_assessment_requests enable row level security;
alter table kaizen_supervisor_meetings enable row level security;
alter table generated_entries enable row level security;

create policy "Users can manage own profile"
  on profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can only see their own data"
  on kaizen_sync_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only see their own CiP progress"
  on kaizen_cip_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only see their own key skill coverage"
  on kaizen_key_skill_coverage
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only see their own entries"
  on kaizen_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only see their own assessment requests"
  on kaizen_assessment_requests
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only see their own supervisor meetings"
  on kaizen_supervisor_meetings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can only see their own generated entries"
  on generated_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

