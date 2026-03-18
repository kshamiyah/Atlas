-- Complete kaizen_ids mappings for all remaining 47 unmapped kaizen IDs.
-- After this migration every kaizen_id the scraper can produce has a direct
-- DB mapping, eliminating the fuzzy-title fallback in matchSingleKaizenKeySkill
-- entirely for the kaizen_direct path.
--
-- Jaccard scores are computed against the normalised DB title using the same
-- token-set logic as the parser (lowercase, replace non-alnum with space).
-- Threshold for "safe without mapping" is Jaccard ≥ 0.50.
--
-- Legend:
--   [FAILS]   Jaccard < 0.50 — would silently mis-match or drop without this row
--   [BORDER]  Jaccard 0.50–0.69 — passes threshold but close enough to risk drift
--   [DETERM]  Jaccard ≥ 0.70 — passes cleanly; added for determinism only
--   [EXACT]   Normalised titles are identical
--   [COMPOSITE] Multiple Kaizen IDs map to one RCOG composite DB skill

-- ── CiP 1 ────────────────────────────────────────────────────────────────────

-- Kaizen: "Facilitates women's decision making" (948844)
-- DB:     "Facilitates womens decision making"
-- Jaccard: exact after normalisation (apostrophe stripped) [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948844']
  WHERE title = 'Facilitates womens decision making'
  AND cip_id IN (SELECT id FROM cips WHERE number = 1);

-- Kaizen: "Provides treatment" (948845)
-- DB:     "Provides treatment"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948845']
  WHERE title = 'Provides treatment'
  AND cip_id IN (SELECT id FROM cips WHERE number = 1);

-- ── CiP 2 ────────────────────────────────────────────────────────────────────

-- Kaizen: "Participates in clinical governance processes" (948885)
-- DB:     "Participates in clinical governance processes"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948885']
  WHERE title = 'Participates in clinical governance processes'
  AND cip_id IN (SELECT id FROM cips WHERE number = 2);

-- ── CiP 3 ────────────────────────────────────────────────────────────────────

-- Kaizen: "Manages conflict" (948888)
-- DB:     "Manages conflict"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948888']
  WHERE title = 'Manages conflict'
  AND cip_id IN (SELECT id FROM cips WHERE number = 3);

-- Kaizen: "Leadership skills" (948889)
-- DB:     "Understands human behaviour and demonstrates leadership skills"
-- Jaccard: 0.29 — well below threshold [FAILS]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948889']
  WHERE title = 'Understands human behaviour and demonstrates leadership skills'
  AND cip_id IN (SELECT id FROM cips WHERE number = 3);

-- Kaizen: "Demonstrates insight" (948890)
-- DB:     "Demonstrates insight"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948890']
  WHERE title = 'Demonstrates insight'
  AND cip_id IN (SELECT id FROM cips WHERE number = 3);

-- Kaizen: "Manages stress and fatigue" (948891)
-- DB:     "Manages stress and fatigue"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948891']
  WHERE title = 'Manages stress and fatigue'
  AND cip_id IN (SELECT id FROM cips WHERE number = 3);

-- Kaizen: "Effective use of resources" (948892)
-- DB:     "Able to make effective use of resources and time management"
-- Jaccard: 0.40 — below threshold [FAILS]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948892']
  WHERE title = 'Able to make effective use of resources and time management'
  AND cip_id IN (SELECT id FROM cips WHERE number = 3);

-- ── CiP 5 ────────────────────────────────────────────────────────────────────

-- Kaizen: "Maintains situational awareness" (948895)
-- DB:     "Maintains situational awareness"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948895']
  WHERE title = 'Maintains situational awareness'
  AND cip_id IN (SELECT id FROM cips WHERE number = 5);

-- Kaizen: "Demonstrates insight into decision making" (948896)
-- DB:     "Demonstrates insight into decision making"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948896']
  WHERE title = 'Demonstrates insight into decision making'
  AND cip_id IN (SELECT id FROM cips WHERE number = 5);

-- Kaizen: "Team working" (948898)
-- DB:     "Team-working"
-- Jaccard: exact after normalisation (hyphen → space) [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948898']
  WHERE title = 'Team-working'
  AND cip_id IN (SELECT id FROM cips WHERE number = 5);

-- Kaizen: "Understands systems and organisational factors" (948899)
-- DB:     "Understands systems and organisational factors"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948899']
  WHERE title = 'Understands systems and organisational factors'
  AND cip_id IN (SELECT id FROM cips WHERE number = 5);

-- ── CiP 6 ────────────────────────────────────────────────────────────────────

-- Kaizen: "Develops people" (948901)
-- DB:     "Develops People"
-- Jaccard: exact after normalisation (case) [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948901']
  WHERE title = 'Develops People'
  AND cip_id IN (SELECT id FROM cips WHERE number = 6);

-- Kaizen: "Promotes excellence" (948902)
-- DB:     "Promotes excellence"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948902']
  WHERE title = 'Promotes excellence'
  AND cip_id IN (SELECT id FROM cips WHERE number = 6);

-- Kaizen: "Provides pastoral care" (948903)
-- DB:     "Provides pastoral care"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948903']
  WHERE title = 'Provides pastoral care'
  AND cip_id IN (SELECT id FROM cips WHERE number = 6);

-- Kaizen: "Performance management" (948905)
-- DB:     "Demonstrates performance management"
-- Jaccard: 0.67 — passes but "Demonstrates" prefix is silent without mapping [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948905']
  WHERE title = 'Demonstrates performance management'
  AND cip_id IN (SELECT id FROM cips WHERE number = 6);

-- ── CiP 7 ────────────────────────────────────────────────────────────────────

-- Kaizen: "Research skills" (948906)
-- DB:     "Demonstrates research skills"
-- Jaccard: 0.67 — passes but "Demonstrates" prefix [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948906']
  WHERE title = 'Demonstrates research skills'
  AND cip_id IN (SELECT id FROM cips WHERE number = 7);

-- Kaizen: "Critical thinking" (948907)
-- DB:     "Demonstrates critical thinking"
-- Jaccard: 0.67 — passes but "Demonstrates" prefix [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948907']
  WHERE title = 'Demonstrates critical thinking'
  AND cip_id IN (SELECT id FROM cips WHERE number = 7);

-- Kaizen: "Innovates" (948908)
-- DB:     "Innovates"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948908']
  WHERE title = 'Innovates'
  AND cip_id IN (SELECT id FROM cips WHERE number = 7);

-- Kaizen: "Translates research into clinical practice" (948909)
-- DB:     "Translates research into clinical practice"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948909']
  WHERE title = 'Translates research into clinical practice'
  AND cip_id IN (SELECT id FROM cips WHERE number = 7);

-- ── CiP 9 ────────────────────────────────────────────────────────────────────

-- Kaizen: "Manages bleeding in early pregnancy" (948918)
-- DB:     "Manages vaginal bleeding and pain in early pregnancy"
-- Jaccard: 0.63 — passes but title divergence warrants determinism [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948918']
  WHERE title = 'Manages vaginal bleeding and pain in early pregnancy'
  AND cip_id IN (SELECT id FROM cips WHERE number = 9);

-- Kaizen: "Manages other early pregnancy complications" (948919)
-- DB:     "Manages other early pregnancy complications"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948919']
  WHERE title = 'Manages other early pregnancy complications'
  AND cip_id IN (SELECT id FROM cips WHERE number = 9);

-- Kaizen: "Manages the acute gynaecological workload" (948920)
-- DB:     "Manages an acute gynaecological workload"
-- Jaccard: 0.67 — "the" vs "an" differ as tokens [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948920']
  WHERE title = 'Manages an acute gynaecological workload'
  AND cip_id IN (SELECT id FROM cips WHERE number = 9);

-- ── CiP 10 ───────────────────────────────────────────────────────────────────

-- Kaizen: "Manages pain and bleeding in pregnancy" (948846)
-- DB:     "Manages pain and bleeding in the pregnant person"
-- Jaccard: 0.56 — borderline; "pregnancy" ≠ "the pregnant person" [BORDER]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948846']
  WHERE title = 'Manages pain and bleeding in the pregnant person'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- Kaizen: "Manages concerns about fetal wellbeing" (948847)
-- DB:     "Manages concerns about fetal wellbeing before labour"
-- Jaccard: 0.71 — extra "before labour" suffix [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948847']
  WHERE title = 'Manages concerns about fetal wellbeing before labour'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- Kaizen: "Manages suspected pre-term labour/SROM" (948848)
-- DB:     "Manages suspected pre-term labour/ruptured membranes"
-- Jaccard: 0.63 — "SROM" ≠ "ruptured membranes" as tokens [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948848']
  WHERE title = 'Manages suspected pre-term labour/ruptured membranes'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- Kaizen: "Manages labour" (948849)
-- DB:     "Manages labour"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948849']
  WHERE title = 'Manages labour'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- Kaizen: "Manages intrapartum fetal surveillance" (948850)
-- DB:     "Manages intrapartum fetal surveillance"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948850']
  WHERE title = 'Manages intrapartum fetal surveillance'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- Kaizen: "Manages emergency birth" (948852)
-- DB:     "Manages emergency birth"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948852']
  WHERE title = 'Manages emergency birth'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- Kaizen: "Manages immediate postpartum problems" (948853)
-- DB:     "Manages immediate postpartum problems"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948853']
  WHERE title = 'Manages immediate postpartum problems'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- Kaizen: "Manages maternal collapse" (948854)
-- DB:     "Manages maternal collapse and people who are acutely unwell in pregnancy"
-- Jaccard: 0.27 — well below threshold [FAILS]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948854']
  WHERE title = 'Manages maternal collapse and people who are acutely unwell in pregnancy'
  AND cip_id IN (SELECT id FROM cips WHERE number = 10);

-- ── CiP 11 ───────────────────────────────────────────────────────────────────

-- Kaizen splits this RCOG composite skill into TWO named Kaizen skills:
--   948856 "Manages abnormal vaginal bleeding"  — Jaccard 0.44 [FAILS]
--   948857 "Manages pelvic and vulval pain"      — Jaccard 0.56 [BORDER]
-- Both map to the same composite DB row. [COMPOSITE]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948856', '948857']
  WHERE title = 'Manages abnormal vaginal bleeding/pelvic and vulval pain/pelvic masses'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

-- Kaizen: "Manages an abnormal cervical smear" (948859)
-- DB:     "Manages an abnormal cervical smear"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948859']
  WHERE title = 'Manages an abnormal cervical smear'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

-- Kaizen: "Manages suspected cancer symptoms" (948860)
-- DB:     "Manages suspected gynaecological cancer symptoms"
-- Jaccard: 0.80 — passes but "gynaecological" missing from Kaizen [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948860']
  WHERE title = 'Manages suspected gynaecological cancer symptoms'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

-- Kaizen: "Manages vulval symptoms" (948862)
-- DB:     "Manages vulval symptoms"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948862']
  WHERE title = 'Manages vulval symptoms'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

-- Kaizen: "Manages menopausal and postmenopausal care" (948863)
-- DB:     "Manages menopausal and postmenopausal care"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948863']
  WHERE title = 'Manages menopausal and postmenopausal care'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

-- Kaizen: "Manages subfertility" (948864)
-- DB:     "Manages subfertility"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948864']
  WHERE title = 'Manages subfertility'
  AND cip_id IN (SELECT id FROM cips WHERE number = 11);

-- ── CiP 12 ───────────────────────────────────────────────────────────────────

-- Kaizen: "Manages pre-existing medical conditions" (948867)
-- DB:     "Manages pre-existing medical conditions in a pregnant woman"
-- Jaccard: 0.56 — extra "in a pregnant woman" suffix [BORDER]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948867']
  WHERE title = 'Manages pre-existing medical conditions in a pregnant woman'
  AND cip_id IN (SELECT id FROM cips WHERE number = 12);

-- Kaizen: "Manages conditions arising in pregnancy" (948868)
-- DB:     "Manages medical conditions arising in pregnancy"
-- Jaccard: 0.83 — "medical" missing from Kaizen [DETERM]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948868']
  WHERE title = 'Manages medical conditions arising in pregnancy'
  AND cip_id IN (SELECT id FROM cips WHERE number = 12);

-- Kaizen: "Manages fetal concerns" (948869)
-- DB:     "Manages fetal concerns"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948869']
  WHERE title = 'Manages fetal concerns'
  AND cip_id IN (SELECT id FROM cips WHERE number = 12);

-- Kaizen: "Manages mental health conditions" (948870)
-- DB:     "Manages mental health conditions in pregnancy and the postnatal period"
-- Jaccard: 0.40 — below threshold [FAILS]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948870']
  WHERE title = 'Manages mental health conditions in pregnancy and the postnatal period'
  AND cip_id IN (SELECT id FROM cips WHERE number = 12);

-- Kaizen: "Supports antenatal decision making" (948872)
-- DB:     "Supports antenatal decision-making"
-- Jaccard: exact after normalisation (hyphen → space) [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948872']
  WHERE title = 'Supports antenatal decision-making'
  AND cip_id IN (SELECT id FROM cips WHERE number = 12);

-- Kaizen: "Manages the postnatal period" (948873)
-- DB:     "Manages the postnatal period"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948873']
  WHERE title = 'Manages the postnatal period'
  AND cip_id IN (SELECT id FROM cips WHERE number = 12);

-- ── CiP 13 ───────────────────────────────────────────────────────────────────

-- Kaizen: "Promotes non-discriminatory practice" (948874)
-- DB:     "Promotes non-discriminatory practice"
-- Jaccard: exact after normalisation (hyphen → space) [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948874']
  WHERE title = 'Promotes non-discriminatory practice'
  AND cip_id IN (SELECT id FROM cips WHERE number = 13);

-- ── CiP 14 ───────────────────────────────────────────────────────────────────

-- Kaizen: "Promotes a healthy lifestyle" (948878)
-- DB:     "Promotes a healthy lifestyle"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948878']
  WHERE title = 'Promotes a healthy lifestyle'
  AND cip_id IN (SELECT id FROM cips WHERE number = 14);

-- Kaizen: "Promotes illness prevention" (948879)
-- DB:     "Promotes illness prevention"
-- Jaccard: exact [EXACT]
UPDATE key_skills
  SET kaizen_ids = ARRAY['948879']
  WHERE title = 'Promotes illness prevention'
  AND cip_id IN (SELECT id FROM cips WHERE number = 14);
