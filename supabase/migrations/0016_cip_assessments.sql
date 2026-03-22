-- Migration: CiP assessments table + courses catalog correct reseed
-- CiP assessments store the trainee self-assessment and ES global judgment
-- per CiP, scraped from the Kaizen CiP assessment form.

-- ── cip_assessments table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cip_assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kaizen_entry_id   text,                         -- Kaizen source ID for dedup
  cip_number        integer,                      -- e.g. 9
  cip_kaizen_id     integer,                      -- Kaizen entity ID e.g. 1426
  cip_name          text,                         -- CiP name from form
  date              date,
  trainee_level     integer CHECK (trainee_level BETWEEN 1 AND 5),  -- SA1
  trainee_comments  text,
  es_agrees         boolean,                      -- null until ES responds
  es_level          integer CHECK (es_level BETWEEN 1 AND 5),        -- ES global judgment
  es_comments       text,
  status            text DEFAULT 'pending'
                    CHECK (status IN ('draft', 'pending', 'complete')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (user_id, kaizen_entry_id)
);

ALTER TABLE cip_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cip_assessments"
  ON cip_assessments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── courses_catalog correct reseed ───────────────────────────────────────────
-- Source: RCOG Matrix of Progression 2024-2025, recommended courses table
-- Stage 1 (ST1-ST2), Stage 2 (ST3-ST5), Stage 3 (ST6-ST7)
-- SITM appears at all 3 stages; Leadership at stages 2 and 3.

DELETE FROM courses_catalog;

INSERT INTO courses_catalog (curriculum_version_id, name, required_by_stage)
VALUES
  -- Stage 1 courses
  ('00000000-0000-0000-0000-000000000001', 'Basic practical skills in obstetrics and gynaecology', 'ST1'),
  ('00000000-0000-0000-0000-000000000001', 'CTG training', 'ST1'),
  ('00000000-0000-0000-0000-000000000001', 'Obstetric simulation course (e.g. PROMPT/ALSO/other)', 'ST1'),
  ('00000000-0000-0000-0000-000000000001', 'Basic ultrasound', 'ST2'),
  ('00000000-0000-0000-0000-000000000001', '3rd degree tear course', 'ST2'),
  ('00000000-0000-0000-0000-000000000001', 'Resilience course (e.g. STEP-UP)', 'ST2'),
  ('00000000-0000-0000-0000-000000000001', 'SITM course', 'ST2'),

  -- Stage 2 courses
  ('00000000-0000-0000-0000-000000000001', 'Obstetric simulation course (ROBUST or equivalent)', 'ST3'),
  ('00000000-0000-0000-0000-000000000001', 'SITM course', 'ST5'),
  ('00000000-0000-0000-0000-000000000001', 'Leadership and management course', 'ST5'),

  -- Stage 3 courses
  ('00000000-0000-0000-0000-000000000001', 'SITM course', 'ST7'),
  ('00000000-0000-0000-0000-000000000001', 'Leadership and management course', 'ST7');
