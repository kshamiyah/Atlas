-- Extend kaizen_ids for key skills whose Kaizen display titles contain commas.
-- Kaizen wraps comma-containing entries in double-quotes within the pipe-separated
-- raw string, which caused the parser to silently drop them entirely.
-- The parser has now been fixed (strips surrounding quotes before matching),
-- but these three IDs still need explicit mappings because fuzzy title matching
-- would fail or be marginal without them.

-- ── CiP 1 ────────────────────────────────────────────────────────────────────
-- Kaizen: "History taking, clinical examination and diagnosis" (948842)
-- DB:     "History taking"
-- Jaccard after normalise: 0.33 — below 0.50 threshold, needs explicit mapping.
UPDATE key_skills
  SET kaizen_ids = ARRAY['948842']
  WHERE title = 'History taking'
  AND cip_id IN (SELECT id FROM cips WHERE number = 1);

-- ── CiP 2 ────────────────────────────────────────────────────────────────────
-- Kaizen: "Adheres to legal, professional requirements" (948883)
-- DB:     "Aware of and adheres to legal principles and professional requirements"
-- Jaccard: 0.56 — would pass fuzzy, added for determinism.
UPDATE key_skills
  SET kaizen_ids = ARRAY['948883']
  WHERE title = 'Aware of and adheres to legal principles and professional requirements'
  AND cip_id IN (SELECT id FROM cips WHERE number = 2);

-- ── CiP 10 ───────────────────────────────────────────────────────────────────
-- Kaizen: "Manages induction, augmentation of labour" (948851)
-- DB:     "Manages induction and augmentation of labour"
-- Jaccard: 0.83 — would pass fuzzy, added for determinism.
UPDATE key_skills
  SET kaizen_ids = ARRAY['948851']
  WHERE title = 'Manages induction and augmentation of labour'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);
