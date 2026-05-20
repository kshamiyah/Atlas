-- Restrict GraphQL and table access
-- Revoke default public/anon/authenticated access and rely on RLS policies instead

-- Revoke all default grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM public, anon, authenticated;

-- Revoke existing grants from all tables
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM public, anon, authenticated', t.tablename);
  END LOOP;
END $$;

-- Grant SELECT only to authenticated role on reference/public tables
-- These are lookup tables that all authenticated users should see
GRANT SELECT ON curriculum_versions TO authenticated;
GRANT SELECT ON cips TO authenticated;
GRANT SELECT ON key_skills TO authenticated;
GRANT SELECT ON descriptors TO authenticated;
GRANT SELECT ON procedures_catalog TO authenticated;
GRANT SELECT ON stages TO authenticated;
GRANT SELECT ON stage_requirements TO authenticated;
GRANT SELECT ON courses_catalog TO authenticated;
GRANT SELECT ON exams_catalog TO authenticated;

-- For user-specific tables, allow SELECT but RLS policies will restrict to own data
GRANT SELECT ON profiles TO authenticated;
GRANT SELECT ON kaizen_sync_log TO authenticated;
GRANT SELECT ON kaizen_cip_progress TO authenticated;
GRANT SELECT ON kaizen_key_skill_coverage TO authenticated;
GRANT SELECT ON kaizen_entries TO authenticated;
GRANT SELECT ON kaizen_assessment_requests TO authenticated;
GRANT SELECT ON kaizen_supervisor_meetings TO authenticated;
GRANT SELECT ON key_skill_descriptor_coverage TO authenticated;
GRANT SELECT ON key_skill_review_entries TO authenticated;
GRANT SELECT ON key_skill_review_push_queue TO authenticated;
GRANT SELECT ON key_skill_review_push_queue_v2_groups TO authenticated;
GRANT SELECT ON key_skill_review_push_queue_v2_jobs TO authenticated;
GRANT SELECT ON key_skill_review_suggestions TO authenticated;
GRANT SELECT ON cip_assessments TO authenticated;
GRANT SELECT ON generated_entries TO authenticated;

-- Allow INSERT/UPDATE/DELETE for authenticated users where RLS policies permit
GRANT INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON kaizen_sync_log TO authenticated;
GRANT INSERT, UPDATE, DELETE ON kaizen_cip_progress TO authenticated;
GRANT INSERT, UPDATE, DELETE ON kaizen_key_skill_coverage TO authenticated;
GRANT INSERT, UPDATE, DELETE ON kaizen_entries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON kaizen_assessment_requests TO authenticated;
GRANT INSERT, UPDATE, DELETE ON kaizen_supervisor_meetings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON key_skill_descriptor_coverage TO authenticated;
GRANT INSERT, UPDATE, DELETE ON key_skill_review_entries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON key_skill_review_push_queue TO authenticated;
GRANT INSERT, UPDATE, DELETE ON key_skill_review_push_queue_v2_groups TO authenticated;
GRANT INSERT, UPDATE, DELETE ON key_skill_review_push_queue_v2_jobs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON key_skill_review_suggestions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON cip_assessments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON generated_entries TO authenticated;

-- Set search_path to immutable for functions
ALTER FUNCTION merge_key_skill_review_entry_metadata() SET search_path TO public;
ALTER FUNCTION key_skill_review_set_updated_at() SET search_path TO public;
