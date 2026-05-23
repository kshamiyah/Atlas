create or replace function public.merge_key_skill_review_entry_metadata()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.metadata = coalesce(new.metadata, '{}'::jsonb);
  else
    new.metadata = coalesce(old.metadata, '{}'::jsonb) || coalesce(new.metadata, '{}'::jsonb);
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'key_skill_review_entries_merge_metadata_trg'
  ) then
    create trigger key_skill_review_entries_merge_metadata_trg
    before insert or update on key_skill_review_entries
    for each row
    execute function public.merge_key_skill_review_entry_metadata();
  end if;
end
$$;
