-- Allow kaizen_direct as a suggestion method (used when key skill attribution
-- comes directly from Kaizen's own extracted_fields["linked key skills"] data).
ALTER TABLE key_skill_review_suggestions
  DROP CONSTRAINT IF EXISTS key_skill_review_suggestions_method_check;

ALTER TABLE key_skill_review_suggestions
  ADD CONSTRAINT key_skill_review_suggestions_method_check
    CHECK (method IN ('rule', 'ai', 'user', 'kaizen_direct'));
