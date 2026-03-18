alter table kaizen_entries
  add column if not exists source_entry_id text,
  add column if not exists source_url text,
  add column if not exists linked_cip_number integer check (linked_cip_number between 1 and 14),
  add column if not exists entry_text text not null default '',
  add column if not exists extracted_fields jsonb not null default '{}'::jsonb,
  add column if not exists extraction_status text not null default 'none'
    check (extraction_status in ('none', 'partial', 'full', 'failed'));

create index if not exists idx_kaizen_entries_user_synced
  on kaizen_entries(user_id, synced_at desc);
