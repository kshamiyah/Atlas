-- Backfill: kaizen_direct suggestions were previously inserted as "suggested"
-- but should be "confirmed" because they are ground-truth manual links from
-- the user's own Kaizen portfolio. The generate route now auto-confirms them
-- on new runs; this migration upgrades existing rows.

UPDATE key_skill_review_suggestions
SET status = 'confirmed'
WHERE method  = 'kaizen_direct'
  AND status  = 'suggested';
