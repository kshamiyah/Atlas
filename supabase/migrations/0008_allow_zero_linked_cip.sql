-- Allow linked_cip_number = 0 as a sentinel for "no linked CiP".
-- Entries scraped without a CiP (e.g. TO1/TO2 observation forms and CbD/OSATS
-- with scraping gaps) are bootstrapped with 0 so the AI cross-CiP suggester
-- can treat all skills as candidates for those entries.
-- Valid CiPs remain 1–14; 0 is the only special value.

ALTER TABLE key_skill_review_entries
  DROP CONSTRAINT key_skill_review_entries_linked_cip_number_check;

ALTER TABLE key_skill_review_entries
  ADD CONSTRAINT key_skill_review_entries_linked_cip_number_check
  CHECK (linked_cip_number between 0 and 14);
