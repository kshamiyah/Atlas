alter table profiles
  add column if not exists default_skills_per_entry_target integer;

update profiles
set default_skills_per_entry_target = 4
where default_skills_per_entry_target is null;

alter table profiles
  alter column default_skills_per_entry_target set default 4;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_default_skills_per_entry_target_chk'
  ) then
    alter table profiles
      add constraint profiles_default_skills_per_entry_target_chk
      check (default_skills_per_entry_target between 3 and 6);
  end if;
end
$$;
