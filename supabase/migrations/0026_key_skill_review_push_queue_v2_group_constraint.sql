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
