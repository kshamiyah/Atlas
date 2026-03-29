-- Add newly confirmed Kaizen IDs from live autocomplete checks.
-- Source: manual validation on Kaizen edit form autocomplete (2026-03-29).

-- CiP 6
UPDATE key_skills
SET kaizen_ids = ARRAY['948904']
WHERE title = 'Provides support to second victims'
  AND cip_id IN (SELECT id FROM cips WHERE number = 6);

-- CiP 10
UPDATE key_skills
SET kaizen_ids = ARRAY['948855']
WHERE title = 'Manages labour ward'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- CiP 11
UPDATE key_skills
SET kaizen_ids = ARRAY['948861']
WHERE title = 'Manages urogynaecological symptoms'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

UPDATE key_skills
SET kaizen_ids = ARRAY['948865']
WHERE title = 'Manages sexual wellbeing'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

UPDATE key_skills
SET kaizen_ids = ARRAY['948866']
WHERE title = 'Manages pain in the postoperative patient'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

-- CiP 14
UPDATE key_skills
SET kaizen_ids = ARRAY['948881']
WHERE title = 'Aware of the globalisation of healthcare'
  AND cip_id IN (SELECT id FROM cips WHERE number = 14);

-- CiP 12
UPDATE key_skills
SET kaizen_ids = ARRAY['948871']
WHERE title = 'Manages complications in pregnancy affected by lifestyle'
  AND cip_id IN (SELECT id FROM cips WHERE number = 12);

-- Still unresolved from autocomplete script (no options returned):
-- - CiP 4:  Appreciates the importance of stakeholders in quality improvement work
