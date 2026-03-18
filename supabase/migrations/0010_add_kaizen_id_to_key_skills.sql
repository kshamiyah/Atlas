-- Add kaizen_ids array column to key_skills for deterministic ID-based matching.
-- Kaizen embeds a numeric ID in every linked key skill string, e.g.:
--   "CiP 8: Educator - Interprofessional learning (948911)"
-- Using this ID avoids fuzzy title matching failures where Kaizen's display
-- name differs from the official RCOG curriculum title stored in the DB.
--
-- Array (not scalar) because Kaizen sometimes splits a single RCOG composite
-- skill into multiple individually-named Kaizen skills — all with different
-- IDs but all referencing the same DB row.  E.g. CiP 9:
--   948914 "Manages non-pregnancy pelvic pain"
--   948915 "Manages non-pregnancy vaginal bleeding"
--   948917 "Manages complications of treatment"
--   → all map to "Manages acute pelvic pain/vaginal bleeding/acute infections/acute complications"

ALTER TABLE key_skills ADD COLUMN IF NOT EXISTS kaizen_ids TEXT[] DEFAULT '{}';

-- GIN index for efficient array-containment lookups.
CREATE INDEX IF NOT EXISTS idx_key_skills_kaizen_ids
  ON key_skills USING gin(kaizen_ids);

-- ── CiP 1 ────────────────────────────────────────────────────────────────────
-- Kaizen: "Facilitates discussions" — trailing 's' means Jaccard 0.33 (fails)
UPDATE key_skills SET kaizen_ids = ARRAY['948843']
  WHERE title = 'Facilitate discussions'
  AND cip_id IN (SELECT id FROM cips WHERE number = 1);

-- ── CiP 2 ────────────────────────────────────────────────────────────────────
-- Kaizen: "Understands healthcare differences across the UK" — Jaccard 0.25
UPDATE key_skills SET kaizen_ids = ARRAY['948882']
  WHERE title = 'Aware of the healthcare systems in the four nations of the UK'
  AND cip_id IN (SELECT id FROM cips WHERE number = 2);

-- Kaizen: "Understands ethical principles" — Jaccard 0.40
UPDATE key_skills SET kaizen_ids = ARRAY['948884']
  WHERE title = 'Aware of ethical principles'
  AND cip_id IN (SELECT id FROM cips WHERE number = 2);

-- Kaizen: "Working in a digital environment" — Jaccard 0.22
UPDATE key_skills SET kaizen_ids = ARRAY['948886']
  WHERE title = 'Works effectively within the digital environment'
  AND cip_id IN (SELECT id FROM cips WHERE number = 2);

-- ── CiP 3 ────────────────────────────────────────────────────────────────────
-- Kaizen: "Influences and negotiates" — Jaccard 0.17
UPDATE key_skills SET kaizen_ids = ARRAY['948887']
  WHERE title = 'Comfortable influencing and negotiating'
  AND cip_id IN (SELECT id FROM cips WHERE number = 3);

-- ── CiP 4 ────────────────────────────────────────────────────────────────────
-- 948893 exact-matches already; stored for determinism.
UPDATE key_skills SET kaizen_ids = ARRAY['948893']
  WHERE title = 'Understands quality improvement'
  AND cip_id IN (SELECT id FROM cips WHERE number = 4);

-- Kaizen: "Effective use of QI in practice" — title doesn't fuzzy-match at all.
UPDATE key_skills SET kaizen_ids = ARRAY['948894']
  WHERE title = 'Undertakes and evaluates impact of quality improvement interventions'
  AND cip_id IN (SELECT id FROM cips WHERE number = 4);

-- ── CiP 5 ────────────────────────────────────────────────────────────────────
-- Kaizen: "Understanding of human factors in adverse events" — Jaccard 0.23
UPDATE key_skills SET kaizen_ids = ARRAY['948897']
  WHERE title = 'Ability to respond to human performance within adverse clinical events'
  AND cip_id IN (SELECT id FROM cips WHERE number = 5);

-- ── CiP 6 ────────────────────────────────────────────────────────────────────
-- Kaizen: "Commits to continued learning" — Jaccard 0.43
UPDATE key_skills SET kaizen_ids = ARRAY['948900']
  WHERE title = 'Demonstrates a commitment to continued learning'
  AND cip_id IN (SELECT id FROM cips WHERE number = 6);

-- ── CiP 8 ────────────────────────────────────────────────────────────────────
-- 948910 matches via containment already; stored for determinism.
UPDATE key_skills SET kaizen_ids = ARRAY['948910']
  WHERE title = 'Delivers effective teaching'
  AND cip_id IN (SELECT id FROM cips WHERE number = 8);

-- Kaizen: "Interprofessional learning" — "interprofessional" ≠ "inter-professional" after tokenisation.
UPDATE key_skills SET kaizen_ids = ARRAY['948911']
  WHERE title = 'Embraces inter-professional learning'
  AND cip_id IN (SELECT id FROM cips WHERE number = 8);

-- 948912 / 948913 exact-match already; stored for determinism.
UPDATE key_skills SET kaizen_ids = ARRAY['948912']
  WHERE title = 'Involves stakeholders in education'
  AND cip_id IN (SELECT id FROM cips WHERE number = 8);

UPDATE key_skills SET kaizen_ids = ARRAY['948913']
  WHERE title = 'Supervises and appraises'
  AND cip_id IN (SELECT id FROM cips WHERE number = 8);

-- ── CiP 9 ────────────────────────────────────────────────────────────────────
-- Kaizen splits this one RCOG composite skill into THREE named Kaizen skills;
-- all three IDs must resolve to the same DB row.
--   948914 "Manages non-pregnancy pelvic pain"       — Jaccard 0.30
--   948915 "Manages non-pregnancy vaginal bleeding"   — Jaccard 0.30
--   948917 "Manages complications of treatment"       — Jaccard ~0.20
UPDATE key_skills SET kaizen_ids = ARRAY['948914', '948915', '948917']
  WHERE title = 'Manages acute pelvic pain/vaginal bleeding/acute infections/acute complications'
  AND cip_id IN (SELECT id FROM cips WHERE number = 9);

-- ── CiP 13 ───────────────────────────────────────────────────────────────────
-- Kaizen: "Understands cultural determinants of health" — Jaccard 0.44
UPDATE key_skills SET kaizen_ids = ARRAY['948875']
  WHERE title = 'Aware of broader social and cultural determinants of health'
  AND cip_id IN (SELECT id FROM cips WHERE number = 13);

-- Kaizen: "Awareness of social wellbeing" — Jaccard 0.43
UPDATE key_skills SET kaizen_ids = ARRAY['948876']
  WHERE title = 'Aware of an individuals social wellbeing'
  AND cip_id IN (SELECT id FROM cips WHERE number = 13);

-- Kaizen: "Mental and physical health associations" — Jaccard 0.40
UPDATE key_skills SET kaizen_ids = ARRAY['948877']
  WHERE title = 'Aware of the interaction between mental and physical health'
  AND cip_id IN (SELECT id FROM cips WHERE number = 13);

-- ── CiP 14 ───────────────────────────────────────────────────────────────────
-- Kaizen: "Understands impact of policy" — Jaccard 0.08
UPDATE key_skills SET kaizen_ids = ARRAY['948880']
  WHERE title = 'Aware of national and international policies impacting womens healthcare'
  AND cip_id IN (SELECT id FROM cips WHERE number = 14);
