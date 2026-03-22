-- Migration: procedure sign-off tracking
-- Adds kaizen_procedure_id + assessor_role_id to kaizen_entries
-- Extends procedures_catalog with kaizen_id, required_by_stage, osats_target
-- Seeds core curriculum 2024 procedures from Matrix of Progression 2024-2025

-- ── kaizen_entries: two new columns ───────────────────────────────────────────
ALTER TABLE kaizen_entries
  ADD COLUMN IF NOT EXISTS kaizen_procedure_id integer,
  ADD COLUMN IF NOT EXISTS assessor_role_id     integer;

-- ── procedures_catalog: extend schema ─────────────────────────────────────────
ALTER TABLE procedures_catalog
  ADD COLUMN IF NOT EXISTS kaizen_id         integer,
  ADD COLUMN IF NOT EXISTS required_by_stage text,
  ADD COLUMN IF NOT EXISTS osats_target      integer DEFAULT 3;

-- ── Seed core curriculum 2024 procedures ──────────────────────────────────────
-- Source: Matrix of Progression 2024-2025, summative OSATS section
-- kaizen_id values verified from Kaizen autocomplete endpoint
-- osats_target is always 3 for core curriculum procedures
-- At least one must have assessor_role_id = 597 (Consultant)

INSERT INTO procedures_catalog
  (curriculum_version_id, name, category, kaizen_id, required_by_stage, osats_target, requires_summative_osats)
VALUES
  -- ST1
  ('00000000-0000-0000-0000-000000000001',
   'Cervical smear',
   'gynaecology', 450, 'ST1', 3, true),

  -- ST2
  ('00000000-0000-0000-0000-000000000001',
   'Caesarean section (basic)',
   'obstetrics', 463, 'ST2', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Non-rotational instrumental delivery',
   'obstetrics', 461, 'ST2', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Perineal repair',
   'obstetrics', 460, 'ST2', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Surgical management of miscarriage or surgical termination of pregnancy < 16 weeks',
   'gynaecology', 452, 'ST2', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Insertion/removal of IUCD/IUS',
   'gynaecology', 451, 'ST2', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Endometrial biopsy',
   'gynaecology', 449, 'ST2', 3, true),

  -- ST3
  ('00000000-0000-0000-0000-000000000001',
   'Manual removal of placenta',
   'obstetrics', 466, 'ST3', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Transabdominal ultrasound examination of early pregnancy',
   'ultrasound', 459, 'ST3', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Transabdominal ultrasound scan examination of late pregnancy',
   'ultrasound', 993, 'ST3', 3, true),

  -- ST4
  ('00000000-0000-0000-0000-000000000001',
   'Hysteroscopy',
   'gynaecology', 453, 'ST4', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Diagnostic laparoscopy',
   'gynaecology', 455, 'ST4', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   '3rd degree tear perineal repair',
   'obstetrics', 991, 'ST4', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Vulval biopsy',
   'gynaecology', 996, 'ST4', 3, true),

  -- ST5
  ('00000000-0000-0000-0000-000000000001',
   'Simple operative laparoscopy',
   'gynaecology', 456, 'ST5', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Rotational instrumental delivery',
   'obstetrics', 462, 'ST5', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Caesarean section (intermediate)',
   'obstetrics', 464, 'ST5', 3, true),

  -- ST7
  ('00000000-0000-0000-0000-000000000001',
   'Caesarean section (complex)',
   'obstetrics', 465, 'ST7', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Laparoscopic management of ectopic pregnancy',
   'gynaecology', 457, 'ST7', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Ovarian cystectomy',
   'gynaecology', 458, 'ST7', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Surgical management of PPH',
   'obstetrics', 467, 'ST7', 3, true),

  ('00000000-0000-0000-0000-000000000001',
   'Surgical uterine evacuation > 16 weeks (including postpartum)',
   'obstetrics', 468, 'ST7', 3, true);
