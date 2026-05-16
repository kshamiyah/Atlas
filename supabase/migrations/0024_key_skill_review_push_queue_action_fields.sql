alter table if exists public.key_skill_review_push_queue
  add column if not exists action_type text,
  add column if not exists group_id uuid,
  add column if not exists sequence_index integer,
  add column if not exists kaizen_skill_id text,
  add column if not exists payload jsonb;

update public.key_skill_review_push_queue
set
  action_type = coalesce(action_type, 'add'),
  payload = coalesce(payload, '{}'::jsonb)
where action_type is null
   or payload is null;

alter table public.key_skill_review_push_queue
  alter column action_type set default 'add',
  alter column payload set default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'key_skill_review_push_queue_action_type_chk'
      and conrelid = 'public.key_skill_review_push_queue'::regclass
  ) then
    alter table public.key_skill_review_push_queue
      add constraint key_skill_review_push_queue_action_type_chk
      check (action_type in ('add', 'remove', 'replace_remove', 'replace_add'));
  end if;
end
$$;
