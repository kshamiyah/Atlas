alter table key_skill_review_suggestions
  add column if not exists suggested_action text null;

alter table key_skill_review_suggestions
  add column if not exists replace_key_skill_id uuid null references key_skills(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'key_skill_review_suggestions_suggested_action_chk'
  ) then
    alter table key_skill_review_suggestions
      add constraint key_skill_review_suggestions_suggested_action_chk
      check (suggested_action in ('add', 'replace'));
  end if;
end
$$;
