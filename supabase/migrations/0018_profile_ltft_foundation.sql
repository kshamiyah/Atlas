alter table profiles
  add column if not exists current_grade text,
  add column if not exists trust text,
  add column if not exists post_history jsonb default '[]'::jsonb,
  add column if not exists rcog_number text,
  add column if not exists gmc_number text,
  add column if not exists ntn text,
  add column if not exists working_percent integer;

update profiles
set post_history = '[]'::jsonb
where post_history is null;

update profiles
set working_percent = 100
where working_percent is null;

alter table profiles
  alter column post_history set default '[]'::jsonb,
  alter column working_percent set default 100;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_working_percent_range_check'
  ) then
    alter table profiles
      add constraint profiles_working_percent_range_check
      check (working_percent between 10 and 100);
  end if;
end $$;
