-- Migration: reseed courses_catalog with correct stage assignments
-- Source: RCOG Matrix of Progression 2024-2025, "Recommended courses / required objectives" table (page 3)
-- Each course is assigned to the specific ST year shown in the matrix column.
-- SITM appears at ST5, ST6, ST7. Leadership appears at ST6 and ST7.

DELETE FROM courses_catalog;

INSERT INTO courses_catalog (curriculum_version_id, name, required_by_stage)
VALUES
  -- ── ST1 ────────────────────────────────────────────────────────────
  ('00000000-0000-0000-0000-000000000001',
   'Basic practical skills in obstetrics and gynaecology', 'ST1'),

  ('00000000-0000-0000-0000-000000000001',
   'CTG training', 'ST1'),

  ('00000000-0000-0000-0000-000000000001',
   'Obstetric simulation course (e.g. PROMPT/ALSO/other)', 'ST1'),

  -- ── ST2 ────────────────────────────────────────────────────────────
  ('00000000-0000-0000-0000-000000000001',
   'Basic ultrasound', 'ST2'),

  ('00000000-0000-0000-0000-000000000001',
   '3rd degree tear course', 'ST2'),

  ('00000000-0000-0000-0000-000000000001',
   'Resilience course (e.g. STEP-UP)', 'ST2'),

  -- ── ST3 ────────────────────────────────────────────────────────────
  ('00000000-0000-0000-0000-000000000001',
   'Obstetric simulation course (ROBUST or equivalent)', 'ST3'),

  -- ── ST5 ────────────────────────────────────────────────────────────
  ('00000000-0000-0000-0000-000000000001',
   'SITM course', 'ST5'),

  -- ── ST6 ────────────────────────────────────────────────────────────
  ('00000000-0000-0000-0000-000000000001',
   'SITM course', 'ST6'),

  ('00000000-0000-0000-0000-000000000001',
   'Leadership and management course', 'ST6'),

  -- ── ST7 ────────────────────────────────────────────────────────────
  ('00000000-0000-0000-0000-000000000001',
   'SITM course', 'ST7'),

  ('00000000-0000-0000-0000-000000000001',
   'Leadership and management course', 'ST7');
