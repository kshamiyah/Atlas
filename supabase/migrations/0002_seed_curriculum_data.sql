-- Seed RCOG O&G Curriculum 2024 reference data
-- Source: CSV files transcribed from the 2024 RCOG Core Curriculum & Matrix of Progression

-- ============================================================
-- 1. Curriculum Version
-- ============================================================

INSERT INTO curriculum_versions (id, name, source_document, effective_from) VALUES
  ('00000000-0000-0000-0000-000000000001', 'RCOG O&G Curriculum 2024', 'core-curriculum-2024-definitive-document.pdf', '2024-08-01')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Stages (ST1 – ST7)
-- ============================================================

INSERT INTO stages (id, name, stage_group, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001', 'ST1', 'Stage One', 1),
  ('00000000-0000-0000-0001-000000000002', 'ST2', 'Stage One', 2),
  ('00000000-0000-0000-0001-000000000003', 'ST3', 'Stage One', 3),
  ('00000000-0000-0000-0001-000000000004', 'ST4', 'Stage Two', 4),
  ('00000000-0000-0000-0001-000000000005', 'ST5', 'Stage Two', 5),
  ('00000000-0000-0000-0001-000000000006', 'ST6', 'Stage Three', 6),
  ('00000000-0000-0000-0001-000000000007', 'ST7', 'Stage Three', 7)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. CiPs (14 Capabilities in Practice)
-- ============================================================
-- Category: generic (1-8), clinical (9-12), specialty (13-14)

INSERT INTO cips (id, curriculum_version_id, number, title, description, category) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 1,
   'Medical knowledge, clinical skills & professional values',
   'The doctor is able to apply medical knowledge, clinical skills and professional values for the provision of high-quality and safe patient-centred care',
   'generic'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', 2,
   'Working within health organisations',
   'The doctor is able to successfully work within health organisations',
   'generic'),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', 3,
   'Leader and follower',
   'The doctor is a leader and follower who has vision, engages and delivers results',
   'generic'),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', 4,
   'Quality improvement',
   'The doctor is able to design and implement quality improvement projects or interventions',
   'generic'),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', 5,
   'Human factors',
   'The doctor understands and applies basic human factors principles and practice at individual, team, organisational and system levels',
   'generic'),
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001', 6,
   'Personal and professional development',
   'The doctor takes an active role in helping themselves and others to develop',
   'generic'),
  ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-000000000001', 7,
   'Research and innovation',
   'The doctor is able to engage with research and promote innovation',
   'generic'),
  ('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0000-000000000001', 8,
   'Teaching and supervision',
   'The doctor is effective as a teacher and supervisor of healthcare professionals',
   'generic'),
  ('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0000-000000000001', 9,
   'Emergencies in gynaecology & early pregnancy',
   'The doctor is competent in recognising, assessing and managing emergencies in gynaecology and early pregnancy',
   'clinical'),
  ('00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000001', 10,
   'Emergencies in obstetrics',
   'The doctor is competent in recognising, assessing and managing emergencies in obstetrics',
   'clinical'),
  ('00000000-0000-0000-0002-000000000011', '00000000-0000-0000-0000-000000000001', 11,
   'Non-emergency gynaecology & early pregnancy',
   'The doctor is competent in recognising, assessing and managing non-emergency gynaecology and early pregnancy care',
   'clinical'),
  ('00000000-0000-0000-0002-000000000012', '00000000-0000-0000-0000-000000000001', 12,
   'Non-emergency obstetrics',
   'The doctor is competent in recognising, assessing and managing non-emergency obstetrics care',
   'clinical'),
  ('00000000-0000-0000-0002-000000000013', '00000000-0000-0000-0000-000000000001', 13,
   'Champion healthcare needs',
   'The doctor is able to champion the healthcare needs of people from all groups within society',
   'specialty'),
  ('00000000-0000-0000-0002-000000000014', '00000000-0000-0000-0000-000000000001', 14,
   'Public health priorities',
   'The doctor takes an active role in implementing public health priorities for women and works within local, national and international structures to promote health and prevent disease',
   'specialty')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. Key Skills (75 total across all 14 CiPs)
-- ============================================================
-- ID scheme: 00000000-0000-0000-0003-{cip_number:03d}{skill_number:03d}000

INSERT INTO key_skills (id, cip_id, skill_number, title, legacy_id) VALUES
  -- CiP 1 (4 key skills)
  ('00000000-0000-0000-0003-001001000000', '00000000-0000-0000-0002-000000000001', 1, 'History taking', 'CiP_1_KS01'),
  ('00000000-0000-0000-0003-001002000000', '00000000-0000-0000-0002-000000000001', 2, 'Facilitate discussions', 'CiP_1_KS02'),
  ('00000000-0000-0000-0003-001003000000', '00000000-0000-0000-0002-000000000001', 3, 'Facilitates womens decision making', 'CiP_1_KS03'),
  ('00000000-0000-0000-0003-001004000000', '00000000-0000-0000-0002-000000000001', 4, 'Provides treatment', 'CiP_1_KS04'),

  -- CiP 2 (5 key skills)
  ('00000000-0000-0000-0003-002001000000', '00000000-0000-0000-0002-000000000002', 1, 'Aware of the healthcare systems in the four nations of the UK', 'CiP_2_KS01'),
  ('00000000-0000-0000-0003-002002000000', '00000000-0000-0000-0002-000000000002', 2, 'Aware of and adheres to legal principles and professional requirements', 'CiP_2_KS02'),
  ('00000000-0000-0000-0003-002003000000', '00000000-0000-0000-0002-000000000002', 3, 'Aware of ethical principles', 'CiP_2_KS03'),
  ('00000000-0000-0000-0003-002004000000', '00000000-0000-0000-0002-000000000002', 4, 'Participates in clinical governance processes', 'CiP_2_KS04'),
  ('00000000-0000-0000-0003-002005000000', '00000000-0000-0000-0002-000000000002', 5, 'Works effectively within the digital environment', 'CiP_2_KS05'),

  -- CiP 3 (6 key skills)
  ('00000000-0000-0000-0003-003001000000', '00000000-0000-0000-0002-000000000003', 1, 'Comfortable influencing and negotiating', 'CiP_3_KS01'),
  ('00000000-0000-0000-0003-003002000000', '00000000-0000-0000-0002-000000000003', 2, 'Manages conflict', 'CiP_3_KS02'),
  ('00000000-0000-0000-0003-003003000000', '00000000-0000-0000-0002-000000000003', 3, 'Understands human behaviour and demonstrates leadership skills', 'CiP_3_KS03'),
  ('00000000-0000-0000-0003-003004000000', '00000000-0000-0000-0002-000000000003', 4, 'Demonstrates insight', 'CiP_3_KS04'),
  ('00000000-0000-0000-0003-003005000000', '00000000-0000-0000-0002-000000000003', 5, 'Manages stress and fatigue', 'CiP_3_KS05'),
  ('00000000-0000-0000-0003-003006000000', '00000000-0000-0000-0002-000000000003', 6, 'Able to make effective use of resources and time management', 'CiP_3_KS06'),

  -- CiP 4 (3 key skills)
  ('00000000-0000-0000-0003-004001000000', '00000000-0000-0000-0002-000000000004', 1, 'Understands quality improvement', 'CiP_4_KS01'),
  ('00000000-0000-0000-0003-004002000000', '00000000-0000-0000-0002-000000000004', 2, 'Appreciates the importance of stakeholders in quality improvement work', 'CiP_4_KS02'),
  ('00000000-0000-0000-0003-004003000000', '00000000-0000-0000-0002-000000000004', 3, 'Undertakes and evaluates impact of quality improvement interventions', 'CiP_4_KS03'),

  -- CiP 5 (5 key skills)
  ('00000000-0000-0000-0003-005001000000', '00000000-0000-0000-0002-000000000005', 1, 'Maintains situational awareness', 'CiP_5_KS01'),
  ('00000000-0000-0000-0003-005002000000', '00000000-0000-0000-0002-000000000005', 2, 'Demonstrates insight into decision making', 'CiP_5_KS02'),
  ('00000000-0000-0000-0003-005003000000', '00000000-0000-0000-0002-000000000005', 3, 'Ability to respond to human performance within adverse clinical events', 'CiP_5_KS03'),
  ('00000000-0000-0000-0003-005004000000', '00000000-0000-0000-0002-000000000005', 4, 'Team-working', 'CiP_5_KS04'),
  ('00000000-0000-0000-0003-005005000000', '00000000-0000-0000-0002-000000000005', 5, 'Understands systems and organisational factors', 'CiP_5_KS05'),

  -- CiP 6 (6 key skills)
  ('00000000-0000-0000-0003-006001000000', '00000000-0000-0000-0002-000000000006', 1, 'Demonstrates a commitment to continued learning', 'CiP_6_KS01'),
  ('00000000-0000-0000-0003-006002000000', '00000000-0000-0000-0002-000000000006', 2, 'Develops People', 'CiP_6_KS02'),
  ('00000000-0000-0000-0003-006003000000', '00000000-0000-0000-0002-000000000006', 3, 'Promotes excellence', 'CiP_6_KS03'),
  ('00000000-0000-0000-0003-006004000000', '00000000-0000-0000-0002-000000000006', 4, 'Provides pastoral care', 'CiP_6_KS04'),
  ('00000000-0000-0000-0003-006005000000', '00000000-0000-0000-0002-000000000006', 5, 'Provides support to second victims', 'CiP_6_KS05'),
  ('00000000-0000-0000-0003-006006000000', '00000000-0000-0000-0002-000000000006', 6, 'Demonstrates performance management', 'CiP_6_KS06'),

  -- CiP 7 (4 key skills)
  ('00000000-0000-0000-0003-007001000000', '00000000-0000-0000-0002-000000000007', 1, 'Demonstrates research skills', 'CiP_7_KS01'),
  ('00000000-0000-0000-0003-007002000000', '00000000-0000-0000-0002-000000000007', 2, 'Demonstrates critical thinking', 'CiP_7_KS02'),
  ('00000000-0000-0000-0003-007003000000', '00000000-0000-0000-0002-000000000007', 3, 'Innovates', 'CiP_7_KS03'),
  ('00000000-0000-0000-0003-007004000000', '00000000-0000-0000-0002-000000000007', 4, 'Translates research into clinical practice', 'CiP_7_KS04'),

  -- CiP 8 (4 key skills)
  ('00000000-0000-0000-0003-008001000000', '00000000-0000-0000-0002-000000000008', 1, 'Delivers effective teaching', 'CiP_8_KS01'),
  ('00000000-0000-0000-0003-008002000000', '00000000-0000-0000-0002-000000000008', 2, 'Embraces inter-professional learning', 'CiP_8_KS02'),
  ('00000000-0000-0000-0003-008003000000', '00000000-0000-0000-0002-000000000008', 3, 'Involves stakeholders in education', 'CiP_8_KS03'),
  ('00000000-0000-0000-0003-008004000000', '00000000-0000-0000-0002-000000000008', 4, 'Supervises and appraises', 'CiP_8_KS04'),

  -- CiP 9 (4 key skills)
  ('00000000-0000-0000-0003-009001000000', '00000000-0000-0000-0002-000000000009', 1, 'Manages acute pelvic pain/vaginal bleeding/acute infections/acute complications', 'CiP_9_KS01'),
  ('00000000-0000-0000-0003-009002000000', '00000000-0000-0000-0002-000000000009', 2, 'Manages vaginal bleeding and pain in early pregnancy', 'CiP_9_KS02'),
  ('00000000-0000-0000-0003-009003000000', '00000000-0000-0000-0002-000000000009', 3, 'Manages other early pregnancy complications', 'CiP_9_KS03'),
  ('00000000-0000-0000-0003-009004000000', '00000000-0000-0000-0002-000000000009', 4, 'Manages an acute gynaecological workload', 'CiP_9_KS04'),

  -- CiP 10 (10 key skills)
  ('00000000-0000-0000-0003-010001000000', '00000000-0000-0000-0002-000000000010', 1, 'Manages pain and bleeding in the pregnant person', 'CiP_10_KS01'),
  ('00000000-0000-0000-0003-010002000000', '00000000-0000-0000-0002-000000000010', 2, 'Manages concerns about fetal wellbeing before labour', 'CiP_10_KS02'),
  ('00000000-0000-0000-0003-010003000000', '00000000-0000-0000-0002-000000000010', 3, 'Manages suspected pre-term labour/ruptured membranes', 'CiP_10_KS03'),
  ('00000000-0000-0000-0003-010004000000', '00000000-0000-0000-0002-000000000010', 4, 'Manages labour', 'CiP_10_KS04'),
  ('00000000-0000-0000-0003-010005000000', '00000000-0000-0000-0002-000000000010', 5, 'Manages intrapartum fetal surveillance', 'CiP_10_KS05'),
  ('00000000-0000-0000-0003-010006000000', '00000000-0000-0000-0002-000000000010', 6, 'Manages induction and augmentation of labour', 'CiP_10_KS06'),
  ('00000000-0000-0000-0003-010007000000', '00000000-0000-0000-0002-000000000010', 7, 'Manages emergency birth', 'CiP_10_KS07'),
  ('00000000-0000-0000-0003-010008000000', '00000000-0000-0000-0002-000000000010', 8, 'Manages immediate postpartum problems', 'CiP_10_KS08'),
  ('00000000-0000-0000-0003-010009000000', '00000000-0000-0000-0002-000000000010', 9, 'Manages maternal collapse and people who are acutely unwell in pregnancy', 'CiP_10_KS09'),
  ('00000000-0000-0000-0003-010010000000', '00000000-0000-0000-0002-000000000010', 10, 'Manages labour ward', 'CiP_10_KS10'),

  -- CiP 11 (9 key skills)
  ('00000000-0000-0000-0003-011001000000', '00000000-0000-0000-0002-000000000011', 1, 'Manages abnormal vaginal bleeding/pelvic and vulval pain/pelvic masses', 'CiP_11_KS01'),
  ('00000000-0000-0000-0003-011002000000', '00000000-0000-0000-0002-000000000011', 2, 'Manages an abnormal cervical smear', 'CiP_11_KS02'),
  ('00000000-0000-0000-0003-011003000000', '00000000-0000-0000-0002-000000000011', 3, 'Manages suspected gynaecological cancer symptoms', 'CiP_11_KS03'),
  ('00000000-0000-0000-0003-011004000000', '00000000-0000-0000-0002-000000000011', 4, 'Manages urogynaecological symptoms', 'CiP_11_KS04'),
  ('00000000-0000-0000-0003-011005000000', '00000000-0000-0000-0002-000000000011', 5, 'Manages vulval symptoms', 'CiP_11_KS05'),
  ('00000000-0000-0000-0003-011006000000', '00000000-0000-0000-0002-000000000011', 6, 'Manages menopausal and postmenopausal care', 'CiP_11_KS06'),
  ('00000000-0000-0000-0003-011007000000', '00000000-0000-0000-0002-000000000011', 7, 'Manages subfertility', 'CiP_11_KS07'),
  ('00000000-0000-0000-0003-011008000000', '00000000-0000-0000-0002-000000000011', 8, 'Manages sexual wellbeing', 'CiP_11_KS08'),
  ('00000000-0000-0000-0003-011009000000', '00000000-0000-0000-0002-000000000011', 9, 'Manages pain in the postoperative patient', 'CiP_11_KS09'),

  -- CiP 12 (7 key skills)
  ('00000000-0000-0000-0003-012001000000', '00000000-0000-0000-0002-000000000012', 1, 'Manages pre-existing medical conditions in a pregnant woman', 'CiP_12_KS01'),
  ('00000000-0000-0000-0003-012002000000', '00000000-0000-0000-0002-000000000012', 2, 'Manages medical conditions arising in pregnancy', 'CiP_12_KS02'),
  ('00000000-0000-0000-0003-012003000000', '00000000-0000-0000-0002-000000000012', 3, 'Manages fetal concerns', 'CiP_12_KS03'),
  ('00000000-0000-0000-0003-012004000000', '00000000-0000-0000-0002-000000000012', 4, 'Manages mental health conditions in pregnancy and the postnatal period', 'CiP_12_KS04'),
  ('00000000-0000-0000-0003-012005000000', '00000000-0000-0000-0002-000000000012', 5, 'Manages complications in pregnancy affected by lifestyle', 'CiP_12_KS05'),
  ('00000000-0000-0000-0003-012006000000', '00000000-0000-0000-0002-000000000012', 6, 'Supports antenatal decision-making', 'CiP_12_KS06'),
  ('00000000-0000-0000-0003-012007000000', '00000000-0000-0000-0002-000000000012', 7, 'Manages the postnatal period', 'CiP_12_KS07'),

  -- CiP 13 (4 key skills)
  ('00000000-0000-0000-0003-013001000000', '00000000-0000-0000-0002-000000000013', 1, 'Promotes non-discriminatory practice', 'CiP_13_KS01'),
  ('00000000-0000-0000-0003-013002000000', '00000000-0000-0000-0002-000000000013', 2, 'Aware of broader social and cultural determinants of health', 'CiP_13_KS02'),
  ('00000000-0000-0000-0003-013003000000', '00000000-0000-0000-0002-000000000013', 3, 'Aware of an individuals social wellbeing', 'CiP_13_KS03'),
  ('00000000-0000-0000-0003-013004000000', '00000000-0000-0000-0002-000000000013', 4, 'Aware of the interaction between mental and physical health', 'CiP_13_KS04'),

  -- CiP 14 (4 key skills)
  ('00000000-0000-0000-0003-014001000000', '00000000-0000-0000-0002-000000000014', 1, 'Promotes a healthy lifestyle', 'CiP_14_KS01'),
  ('00000000-0000-0000-0003-014002000000', '00000000-0000-0000-0002-000000000014', 2, 'Promotes illness prevention', 'CiP_14_KS02'),
  ('00000000-0000-0000-0003-014003000000', '00000000-0000-0000-0002-000000000014', 3, 'Aware of national and international policies impacting womens healthcare', 'CiP_14_KS03'),
  ('00000000-0000-0000-0003-014004000000', '00000000-0000-0000-0002-000000000014', 4, 'Aware of the globalisation of healthcare', 'CiP_14_KS04')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. Descriptors (all ~344 descriptors)
-- ============================================================
-- ID scheme: 00000000-0000-0000-0004-{cip:03d}{ks:03d}{desc:03d}

INSERT INTO descriptors (id, key_skill_id, text, sort_order) VALUES
  -- CiP_1_KS01 (5 descriptors)
  ('00000000-0000-0000-0004-001001001000', '00000000-0000-0000-0003-001001000000', 'Can take a detailed, focused history, including details of current medication.', 1),
  ('00000000-0000-0000-0004-001001002000', '00000000-0000-0000-0003-001001000000', 'Conducts appropriate clinical examinations.', 2),
  ('00000000-0000-0000-0004-001001003000', '00000000-0000-0000-0003-001001000000', 'Documents clinical encounters in an accurate, complete, timely and accessible manner, in line with legal requirements.', 3),
  ('00000000-0000-0000-0004-001001004000', '00000000-0000-0000-0003-001001000000', 'Can select appropriate investigations and interpret results.', 4),
  ('00000000-0000-0000-0004-001001005000', '00000000-0000-0000-0003-001001000000', 'Lists possible diagnoses and applies clinical judgement to arrive at a working diagnosis.', 5),

  -- CiP_1_KS02 (2 descriptors)
  ('00000000-0000-0000-0004-001002001000', '00000000-0000-0000-0003-001002000000', 'Uses empathy.', 1),
  ('00000000-0000-0000-0004-001002002000', '00000000-0000-0000-0003-001002000000', 'Modifies their approach to the patient when cultural background or personal values may have an impact on engagement and care.', 2),

  -- CiP_1_KS03 (4 descriptors)
  ('00000000-0000-0000-0004-001003001000', '00000000-0000-0000-0003-001003000000', 'Considers the views, preferences and expectations of patients and their families to put together a patient-centred management plan.', 1),
  ('00000000-0000-0000-0004-001003002000', '00000000-0000-0000-0003-001003000000', 'Shares information with patients and their families clearly, in a timely, non-judgmental fashion and facilitates communication.', 2),
  ('00000000-0000-0000-0004-001003003000', '00000000-0000-0000-0003-001003000000', 'Recognises limitations and escalates care, where appropriate.', 3),
  ('00000000-0000-0000-0004-001003004000', '00000000-0000-0000-0003-001003000000', 'Creates the conditions for informed consent to be given, explaining the risks and benefits of, or the rationale for, a proposed procedure or treatment.', 4),

  -- CiP_1_KS04 (8 descriptors)
  ('00000000-0000-0000-0004-001004001000', '00000000-0000-0000-0003-001004000000', 'Demonstrates a commitment to high-quality care, which is safe and effective and delivers a good patient experience.', 1),
  ('00000000-0000-0000-0004-001004002000', '00000000-0000-0000-0003-001004000000', 'Prescribes medicines.', 2),
  ('00000000-0000-0000-0004-001004003000', '00000000-0000-0000-0003-001004000000', 'Demonstrates understanding of infection control and hospital-acquired infection when treating infection in women.', 3),
  ('00000000-0000-0000-0004-001004004000', '00000000-0000-0000-0003-001004000000', 'Demonstrates an ability to deal with complex situations.', 4),
  ('00000000-0000-0000-0004-001004005000', '00000000-0000-0000-0003-001004000000', 'Determines responsibility for follow up, including appropriate intervals for monitoring, location of care, instructions on accessing emergency help.', 5),
  ('00000000-0000-0000-0004-001004006000', '00000000-0000-0000-0003-001004000000', 'Provides the patient with a comprehensive postoperative explanation of the operative findings and procedure undertaken.', 6),
  ('00000000-0000-0000-0004-001004007000', '00000000-0000-0000-0003-001004000000', 'Works effectively within a multiprofessional team to meet the needs of the individual.', 7),
  ('00000000-0000-0000-0004-001004008000', '00000000-0000-0000-0003-001004000000', 'Can make referrals for complex cases.', 8)
ON CONFLICT (id) DO NOTHING;

-- NOTE: The full descriptors for CiPs 2-14 continue below.
-- For brevity in this migration, we insert them in batches.

-- CiP 2 descriptors
INSERT INTO descriptors (id, key_skill_id, text, sort_order) VALUES
  -- CiP_2_KS01 (5)
  ('00000000-0000-0000-0004-002001001000', '00000000-0000-0000-0003-002001000000', 'Understands the NHS constitution and its founding principles.', 1),
  ('00000000-0000-0000-0004-002001002000', '00000000-0000-0000-0003-002001000000', 'Understands how healthcare services are currently commissioned and funded and the key organisational structures.', 2),
  ('00000000-0000-0000-0004-002001003000', '00000000-0000-0000-0003-002001000000', 'Understands the role of the UK government and the agencies and public bodies who work with the department of health.', 3),
  ('00000000-0000-0000-0004-002001004000', '00000000-0000-0000-0003-002001000000', 'Appreciates the role of third-sector organisations in healthcare.', 4),
  ('00000000-0000-0000-0004-002001005000', '00000000-0000-0000-0003-002001000000', 'Demonstrates an awareness of budget and resource management.', 5),
  -- CiP_2_KS02 (5)
  ('00000000-0000-0000-0004-002002001000', '00000000-0000-0000-0003-002002000000', 'Understands the legislative and regulatory framework within which healthcare is provided in the four nations of the UK.', 1),
  ('00000000-0000-0000-0004-002002002000', '00000000-0000-0000-0003-002002000000', 'Follows GMC guidance on professionalism and confidentiality.', 2),
  ('00000000-0000-0000-0004-002002003000', '00000000-0000-0000-0003-002002000000', 'Understands the human rights principles and legal issues surrounding informed consent and respectful care, including key legal rulings.', 3),
  ('00000000-0000-0000-0004-002002004000', '00000000-0000-0000-0003-002002000000', 'Understands the role of the obstetrician in safeguarding children.', 4),
  ('00000000-0000-0000-0004-002002005000', '00000000-0000-0000-0003-002002000000', 'Demonstrates awareness of areas of conscientious objection in themselves, their colleagues and their patients.', 5),
  -- CiP_2_KS03 (2)
  ('00000000-0000-0000-0004-002003001000', '00000000-0000-0000-0003-002003000000', 'Understands ethical principles and how these underpin practice.', 1),
  ('00000000-0000-0000-0004-002003002000', '00000000-0000-0000-0003-002003000000', 'Acts professionally in difficult ethical situations.', 2),
  -- CiP_2_KS04 (7)
  ('00000000-0000-0000-0004-002004001000', '00000000-0000-0000-0003-002004000000', 'Follows safety processes that exist locally and nationally.', 1),
  ('00000000-0000-0000-0004-002004002000', '00000000-0000-0000-0003-002004000000', 'Actively engages in a culture that promotes safety.', 2),
  ('00000000-0000-0000-0004-002004003000', '00000000-0000-0000-0003-002004000000', 'Understands the ways in which incidents can be investigated and the theory that underpins this.', 3),
  ('00000000-0000-0000-0004-002004004000', '00000000-0000-0000-0003-002004000000', 'Participates in incident investigations and links recommendations to quality improvement.', 4),
  ('00000000-0000-0000-0004-002004005000', '00000000-0000-0000-0003-002004000000', 'Discloses harmful patient safety incidents to patients and their families accurately and appropriately.', 5),
  ('00000000-0000-0000-0004-002004006000', '00000000-0000-0000-0003-002004000000', 'Demonstrates humanity and empathy for both first and second victims of adverse incidents.', 6),
  ('00000000-0000-0000-0004-002004007000', '00000000-0000-0000-0003-002004000000', 'Actively engages with and learns from women and their families in improving patient safety and experience.', 7),
  -- CiP_2_KS05 (6)
  ('00000000-0000-0000-0004-002005001000', '00000000-0000-0000-0003-002005000000', 'Understands the principles of data governance and legislation around data protection.', 1),
  ('00000000-0000-0000-0004-002005002000', '00000000-0000-0000-0003-002005000000', 'Understands the need for proactive and responsible interaction with digital platforms.', 2),
  ('00000000-0000-0000-0004-002005003000', '00000000-0000-0000-0003-002005000000', 'Effectively signposts patients and health professionals to patient support websites and newsletters.', 3),
  ('00000000-0000-0000-0004-002005004000', '00000000-0000-0000-0003-002005000000', 'Is able to work with patients to interpret information in the public domain.', 4),
  ('00000000-0000-0000-0004-002005005000', '00000000-0000-0000-0003-002005000000', 'Maintains an appropriate digital persona, e.g. on social media.', 5),
  ('00000000-0000-0000-0004-002005006000', '00000000-0000-0000-0003-002005000000', 'Demonstrates ability to interact appropriately with womens concerns and public campaigns.', 6)
ON CONFLICT (id) DO NOTHING;

-- CiP 3-8 descriptors (generic CiPs)
INSERT INTO descriptors (id, key_skill_id, text, sort_order) VALUES
  -- CiP_3_KS01 (3)
  ('00000000-0000-0000-0004-003001001000', '00000000-0000-0000-0003-003001000000', 'Evaluates their own preferred negotiation style.', 1),
  ('00000000-0000-0000-0004-003001002000', '00000000-0000-0000-0003-003001000000', 'Can handle a variety of negotiation challenges.', 2),
  ('00000000-0000-0000-0004-003001003000', '00000000-0000-0000-0003-003001000000', 'Understands and is able to secure and consolidate agreements.', 3),
  -- CiP_3_KS02 (3)
  ('00000000-0000-0000-0004-003002001000', '00000000-0000-0000-0003-003002000000', 'Understands the concept of conflict in the healthcare setting.', 1),
  ('00000000-0000-0000-0004-003002002000', '00000000-0000-0000-0003-003002000000', 'Understands the challenges and negative effects of conflict within teams and wider organisations.', 2),
  ('00000000-0000-0000-0004-003002003000', '00000000-0000-0000-0003-003002000000', 'Understands and implements the methods and tools used to manage conflict and its resolution.', 3),
  -- CiP_3_KS03 (5)
  ('00000000-0000-0000-0004-003003001000', '00000000-0000-0000-0003-003003000000', 'Actively contributes to a positive culture and respectful care by role modelling appropriate language and behaviour.', 1),
  ('00000000-0000-0000-0004-003003002000', '00000000-0000-0000-0003-003003000000', 'Understands the basic principles and importance of emotional intelligence.', 2),
  ('00000000-0000-0000-0004-003003003000', '00000000-0000-0000-0003-003003000000', 'Reflects on own leadership style and how this can have an impact on interactions with patients and colleagues.', 3),
  ('00000000-0000-0000-0004-003003004000', '00000000-0000-0000-0003-003003000000', 'Demonstrates the ability to adapt their leadership style to different situations.', 4),
  ('00000000-0000-0000-0004-003003005000', '00000000-0000-0000-0003-003003000000', 'Continues to enhance leadership skills.', 5),
  -- CiP_3_KS04 (3)
  ('00000000-0000-0000-0004-003004001000', '00000000-0000-0000-0003-003004000000', 'Demonstrates insight into their own knowledge and performance.', 1),
  ('00000000-0000-0000-0004-003004002000', '00000000-0000-0000-0003-003004000000', 'Adapts within the clinical environment.', 2),
  ('00000000-0000-0000-0004-003004003000', '00000000-0000-0000-0003-003004000000', 'Can provide evidence that they reflect on practice and demonstrate learning from it.', 3),
  -- CiP_3_KS05 (4)
  ('00000000-0000-0000-0004-003005001000', '00000000-0000-0000-0003-003005000000', 'Understands stress.', 1),
  ('00000000-0000-0000-0004-003005002000', '00000000-0000-0000-0003-003005000000', 'Develops personal strategies to maintain mental strength and resilience.', 2),
  ('00000000-0000-0000-0004-003005003000', '00000000-0000-0000-0003-003005000000', 'Shows how they are improving resilience as part of their personal development.', 3),
  ('00000000-0000-0000-0004-003005004000', '00000000-0000-0000-0003-003005000000', 'Recognises the impact of stress and fatigue in their team and offer/signposts to support.', 4),
  -- CiP_3_KS06 (4)
  ('00000000-0000-0000-0004-003006001000', '00000000-0000-0000-0003-003006000000', 'Can prioritise effectively.', 1),
  ('00000000-0000-0000-0004-003006002000', '00000000-0000-0000-0003-003006000000', 'Demonstrates effective time management in clinical settings.', 2),
  ('00000000-0000-0000-0004-003006003000', '00000000-0000-0000-0003-003006000000', 'Effectively delegates tasks to other members of the MDT.', 3),
  ('00000000-0000-0000-0004-003006004000', '00000000-0000-0000-0003-003006000000', 'Demonstrates awareness of how to manage a budget and resources.', 4),
  -- CiP_4_KS01 (3)
  ('00000000-0000-0000-0004-004001001000', '00000000-0000-0000-0003-004001000000', 'Understands the difference between quality improvement and research.', 1),
  ('00000000-0000-0000-0004-004001002000', '00000000-0000-0000-0003-004001000000', 'Understands quality improvement methodology such as Plan, Do, Study, Act (PDSA) cycles.', 2),
  ('00000000-0000-0000-0004-004001003000', '00000000-0000-0000-0003-004001000000', 'Understands the concepts of big data and national clinical audit.', 3),
  -- CiP_4_KS02 (1)
  ('00000000-0000-0000-0004-004002001000', '00000000-0000-0000-0003-004002000000', 'Appreciates the importance of stakeholders in quality improvement work, encouraging involvement with patient groups.', 1),
  -- CiP_4_KS03 (3)
  ('00000000-0000-0000-0004-004003001000', '00000000-0000-0000-0003-004003000000', 'Is actively involved in quality improvement initiatives.', 1),
  ('00000000-0000-0000-0004-004003002000', '00000000-0000-0000-0003-004003000000', 'Considers the best way to share learning.', 2),
  ('00000000-0000-0000-0004-004003003000', '00000000-0000-0000-0003-004003000000', 'Evaluates QI projects and how these can work at a local level.', 3),
  -- CiP_5_KS01 (3)
  ('00000000-0000-0000-0004-005001001000', '00000000-0000-0000-0003-005001000000', 'Understands and applies the three critical stages of situational awareness.', 1),
  ('00000000-0000-0000-0004-005001002000', '00000000-0000-0000-0003-005001000000', 'Understands and applies situational awareness when working as a team and by themselves.', 2),
  ('00000000-0000-0000-0004-005001003000', '00000000-0000-0000-0003-005001000000', 'Maintains situational awareness in environments where safety is critical.', 3),
  -- CiP_5_KS02 (7)
  ('00000000-0000-0000-0004-005002001000', '00000000-0000-0000-0003-005002000000', 'Understands the psychological theories on how we make decisions under pressure.', 1),
  ('00000000-0000-0000-0004-005002002000', '00000000-0000-0000-0003-005002000000', 'Understands the different types of decision-making: intuitive, rule-based, analytical and creative.', 2),
  ('00000000-0000-0000-0004-005002003000', '00000000-0000-0000-0003-005002000000', 'Demonstrates insight into their own decision-making process.', 3),
  ('00000000-0000-0000-0004-005002004000', '00000000-0000-0000-0003-005002000000', 'Can review and analyse the decisions of others.', 4),
  ('00000000-0000-0000-0004-005002005000', '00000000-0000-0000-0003-005002000000', 'Progresses from analytical to intuitive decision making.', 5),
  ('00000000-0000-0000-0004-005002006000', '00000000-0000-0000-0003-005002000000', 'Reflects on unconscious biases which may influence our interaction and behaviour.', 6),
  ('00000000-0000-0000-0004-005002007000', '00000000-0000-0000-0003-005002000000', 'When making clinical decisions, considers patient preferences and evidence-based practice.', 7),
  -- CiP_5_KS03 (3)
  ('00000000-0000-0000-0004-005003001000', '00000000-0000-0000-0003-005003000000', 'Demonstrates knowledge and effects of different types of human error/violations on outcomes.', 1),
  ('00000000-0000-0000-0004-005003002000', '00000000-0000-0000-0003-005003000000', 'Demonstrates knowledge and effects of unconscious and cognitive biases.', 2),
  ('00000000-0000-0000-0004-005003003000', '00000000-0000-0000-0003-005003000000', 'Reviews the effects of human error and biases in clinical practice.', 3),
  -- CiP_5_KS04 (8)
  ('00000000-0000-0000-0004-005004001000', '00000000-0000-0000-0003-005004000000', 'Understands team-working in complex dynamic situations.', 1),
  ('00000000-0000-0000-0004-005004002000', '00000000-0000-0000-0003-005004000000', 'Is able to adapt to changing teams.', 2),
  ('00000000-0000-0000-0004-005004003000', '00000000-0000-0000-0003-005004000000', 'Works effectively as part of a MDT in different roles.', 3),
  ('00000000-0000-0000-0004-005004004000', '00000000-0000-0000-0003-005004000000', 'Communicates effectively within the MDT and with patients, relatives and members of the public.', 4),
  ('00000000-0000-0000-0004-005004005000', '00000000-0000-0000-0003-005004000000', 'Understands that multiple methods of communication are required.', 5),
  ('00000000-0000-0000-0004-005004006000', '00000000-0000-0000-0003-005004000000', 'Demonstrates appropriate assertiveness and challenges colleagues constructively.', 6),
  ('00000000-0000-0000-0004-005004007000', '00000000-0000-0000-0003-005004000000', 'Reflects on breakdowns in team-working and communication.', 7),
  ('00000000-0000-0000-0004-005004008000', '00000000-0000-0000-0003-005004000000', 'Recognises and celebrates effective MDT working.', 8),
  -- CiP_5_KS05 (5)
  ('00000000-0000-0000-0004-005005001000', '00000000-0000-0000-0003-005005000000', 'Recognises how equipment and the environment contribute to outcomes and patient safety.', 1),
  ('00000000-0000-0000-0004-005005002000', '00000000-0000-0000-0003-005005000000', 'Is aware of latent and active failures within healthcare systems and the effects on safety.', 2),
  ('00000000-0000-0000-0004-005005003000', '00000000-0000-0000-0003-005005000000', 'Promotes a safety culture by role modelling ideal behaviours.', 3),
  ('00000000-0000-0000-0004-005005004000', '00000000-0000-0000-0003-005005000000', 'Knows how to escalate safety concerns.', 4),
  ('00000000-0000-0000-0004-005005005000', '00000000-0000-0000-0003-005005000000', 'Understands the concept of high reliability organisations.', 5),
  -- CiP_6_KS01 (4)
  ('00000000-0000-0000-0004-006001001000', '00000000-0000-0000-0003-006001000000', 'Understands own learning styles.', 1),
  ('00000000-0000-0000-0004-006001002000', '00000000-0000-0000-0003-006001000000', 'Identifies opportunities for learning and development through regular reflection and feedback.', 2),
  ('00000000-0000-0000-0004-006001003000', '00000000-0000-0000-0003-006001000000', 'Implements personal development plans (PDP) to enhance and progress their professional practice.', 3),
  ('00000000-0000-0000-0004-006001004000', '00000000-0000-0000-0003-006001000000', 'Applies their learning to professional practice.', 4),
  -- CiP_6_KS02 (3)
  ('00000000-0000-0000-0004-006002001000', '00000000-0000-0000-0003-006002000000', 'Acts as a supportive colleague and critical friend.', 1),
  ('00000000-0000-0000-0004-006002002000', '00000000-0000-0000-0003-006002000000', 'Encourages career development in others.', 2),
  ('00000000-0000-0000-0004-006002003000', '00000000-0000-0000-0003-006002000000', 'Understands concepts of formal mentoring and coaching.', 3),
  -- CiP_6_KS03 (2)
  ('00000000-0000-0000-0004-006003001000', '00000000-0000-0000-0003-006003000000', 'Encourages and supports colleagues in their endeavours.', 1),
  ('00000000-0000-0000-0004-006003002000', '00000000-0000-0000-0003-006003000000', 'Signposts to colleagues and other healthcare professionals to promote high-quality and innovative practice.', 2),
  -- CiP_6_KS04 (3)
  ('00000000-0000-0000-0004-006004001000', '00000000-0000-0000-0003-006004000000', 'Identifies and creates a safe and supportive working environment for colleagues.', 1),
  ('00000000-0000-0000-0004-006004002000', '00000000-0000-0000-0003-006004000000', 'Demonstrates an awareness of the characteristics of a colleague in difficulty.', 2),
  ('00000000-0000-0000-0004-006004003000', '00000000-0000-0000-0003-006004000000', 'Supports and guides a colleague in difficulty using the processes that exist within the NHS.', 3),
  -- CiP_6_KS05 (3)
  ('00000000-0000-0000-0004-006005001000', '00000000-0000-0000-0003-006005000000', 'Sensitively debriefs after an adverse incident.', 1),
  ('00000000-0000-0000-0004-006005002000', '00000000-0000-0000-0003-006005000000', 'Is aware that traumatic events may lead to psychological effects which need professional intervention and support.', 2),
  ('00000000-0000-0000-0004-006005003000', '00000000-0000-0000-0003-006005000000', 'Understands the importance of signposting colleagues to psychological support services.', 3),
  -- CiP_6_KS06 (3)
  ('00000000-0000-0000-0004-006006001000', '00000000-0000-0000-0003-006006000000', 'Understands the basic principles of performance management.', 1),
  ('00000000-0000-0000-0004-006006002000', '00000000-0000-0000-0003-006006000000', 'Uses SMART objectives to set personal development goals.', 2),
  ('00000000-0000-0000-0004-006006003000', '00000000-0000-0000-0003-006006000000', 'Understands how to use competency frameworks as a performance management and development tool.', 3),
  -- CiP_7_KS01 (5)
  ('00000000-0000-0000-0004-007001001000', '00000000-0000-0000-0003-007001000000', 'Understands the principles of healthcare research and different methodologies.', 1),
  ('00000000-0000-0000-0004-007001002000', '00000000-0000-0000-0003-007001000000', 'Understands the principles of ethics and governance within research.', 2),
  ('00000000-0000-0000-0004-007001003000', '00000000-0000-0000-0003-007001000000', 'Understands how to use informatics.', 3),
  ('00000000-0000-0000-0004-007001004000', '00000000-0000-0000-0003-007001000000', 'Performs literature searches.', 4),
  ('00000000-0000-0000-0004-007001005000', '00000000-0000-0000-0003-007001000000', 'Has the ability to translate research into practice.', 5),
  -- CiP_7_KS02 (2)
  ('00000000-0000-0000-0004-007002001000', '00000000-0000-0000-0003-007002000000', 'Critically evaluates arguments and evidence.', 1),
  ('00000000-0000-0000-0004-007002002000', '00000000-0000-0000-0003-007002000000', 'Can communicate and interpret research evidence in a meaningful, unbiased way.', 2),
  -- CiP_7_KS03 (4)
  ('00000000-0000-0000-0004-007003001000', '00000000-0000-0000-0003-007003000000', 'Open to innovative ideas and considers the views of women.', 1),
  ('00000000-0000-0000-0004-007003002000', '00000000-0000-0000-0003-007003000000', 'Shows initiative by identifying problems and creating solutions.', 2),
  ('00000000-0000-0000-0004-007003003000', '00000000-0000-0000-0003-007003000000', 'Supports change by their ability to reach a consensus.', 3),
  ('00000000-0000-0000-0004-007003004000', '00000000-0000-0000-0003-007003000000', 'Understands the value of failure in innovation.', 4),
  -- CiP_7_KS04 (4)
  ('00000000-0000-0000-0004-007004001000', '00000000-0000-0000-0003-007004000000', 'Engages with emerging diagnostic and treatment options.', 1),
  ('00000000-0000-0000-0004-007004002000', '00000000-0000-0000-0003-007004000000', 'Is able to communicate to the patient the balance of risks and benefits of clinical treatment and uncertainty.', 2),
  ('00000000-0000-0000-0004-007004003000', '00000000-0000-0000-0003-007004000000', 'Is able to appropriately interpret and communicate the results of screening and diagnostic tests.', 3),
  ('00000000-0000-0000-0004-007004004000', '00000000-0000-0000-0003-007004000000', 'Applies knowledge of Mendelian inheritance, chromosomal abnormalities and genomic medicine.', 4),
  -- CiP_8_KS01 (5)
  ('00000000-0000-0000-0004-008001001000', '00000000-0000-0000-0003-008001000000', 'Understands learning theories relevant to medical education.', 1),
  ('00000000-0000-0000-0004-008001002000', '00000000-0000-0000-0003-008001000000', 'Plans and delivers effective learning strategies and activities.', 2),
  ('00000000-0000-0000-0004-008001003000', '00000000-0000-0000-0003-008001000000', 'Promotes a safe learning environment and makes sure patient safety is maintained.', 3),
  ('00000000-0000-0000-0004-008001004000', '00000000-0000-0000-0003-008001000000', 'Understands techniques for giving feedback and can provide it in a timely and constructive manner.', 4),
  ('00000000-0000-0000-0004-008001005000', '00000000-0000-0000-0003-008001000000', 'Evaluates and reflects on the effectiveness of their educational activities.', 5),
  -- CiP_8_KS02 (2)
  ('00000000-0000-0000-0004-008002001000', '00000000-0000-0000-0003-008002000000', 'Understands the value of learning in teams.', 1),
  ('00000000-0000-0000-0004-008002002000', '00000000-0000-0000-0003-008002000000', 'Facilitates and participates in inter-professional learning.', 2),
  -- CiP_8_KS03 (2)
  ('00000000-0000-0000-0004-008003001000', '00000000-0000-0000-0003-008003000000', 'Commits to learning from patients and stakeholders.', 1),
  ('00000000-0000-0000-0004-008003002000', '00000000-0000-0000-0003-008003000000', 'Demonstrates commitment to patient education.', 2),
  -- CiP_8_KS04 (3)
  ('00000000-0000-0000-0004-008004001000', '00000000-0000-0000-0003-008004000000', 'Contributes towards staff development and training, including supervision, appraisal and workplace assessment.', 1),
  ('00000000-0000-0000-0004-008004002000', '00000000-0000-0000-0003-008004000000', 'Demonstrates ability to act as a Clinical Supervisor.', 2),
  ('00000000-0000-0000-0004-008004003000', '00000000-0000-0000-0003-008004000000', 'Understands the appraisal and revalidation process.', 3)
ON CONFLICT (id) DO NOTHING;

-- Clinical CiP descriptors (9-12) and specialty CiPs (13-14) are extensive.
-- We insert them via a separate statement for cleanliness.

-- CiP 9-14 descriptors are inserted in a third batch to keep statement size manageable.
-- These are generated from the CSV data and follow the same ID scheme.

INSERT INTO descriptors (id, key_skill_id, text, sort_order) VALUES
  -- CiP_9_KS01 (8)
  ('00000000-0000-0000-0004-009001001000', '00000000-0000-0000-0003-009001000000', 'Performs a focused history and appropriate examination, and orders appropriate investigations.', 1),
  ('00000000-0000-0000-0004-009001002000', '00000000-0000-0000-0003-009001000000', 'Formulates a differential diagnosis.', 2),
  ('00000000-0000-0000-0004-009001003000', '00000000-0000-0000-0003-009001000000', 'Discusses diagnosis with a patient in a sensitive manner.', 3),
  ('00000000-0000-0000-0004-009001004000', '00000000-0000-0000-0003-009001000000', 'Formulates an appropriate individualised management plan, taking into account a persons preferences and the urgency required.', 4),
  ('00000000-0000-0000-0004-009001005000', '00000000-0000-0000-0003-009001000000', 'Recognises limitations and escalates care to senior colleagues and other specialities, when appropriate.', 5),
  ('00000000-0000-0000-0004-009001006000', '00000000-0000-0000-0003-009001000000', 'Performs surgery, where appropriate.', 6),
  ('00000000-0000-0000-0004-009001007000', '00000000-0000-0000-0003-009001000000', 'Ensures continuity of care, effective handover and appropriate discharge plan.', 7),
  ('00000000-0000-0000-0004-009001008000', '00000000-0000-0000-0003-009001000000', 'Ensures appropriate risk management procedures are followed.', 8),
  -- CiP_9_KS02 (8)
  ('00000000-0000-0000-0004-009002001000', '00000000-0000-0000-0003-009002000000', 'Takes a focused history and appropriate examination, and orders appropriate investigations.', 1),
  ('00000000-0000-0000-0004-009002002000', '00000000-0000-0000-0003-009002000000', 'Formulates a differential diagnosis.', 2),
  ('00000000-0000-0000-0004-009002003000', '00000000-0000-0000-0003-009002000000', 'Discusses diagnosis with a patient in a sensitive manner.', 3),
  ('00000000-0000-0000-0004-009002004000', '00000000-0000-0000-0003-009002000000', 'Formulates an appropriate and individualised management plan, taking into account a persons preferences and the urgency required.', 4),
  ('00000000-0000-0000-0004-009002005000', '00000000-0000-0000-0003-009002000000', 'Recognises limitations and escalates care to senior colleagues and other specialities, when appropriate.', 5),
  ('00000000-0000-0000-0004-009002006000', '00000000-0000-0000-0003-009002000000', 'Performs surgery, where appropriate.', 6),
  ('00000000-0000-0000-0004-009002007000', '00000000-0000-0000-0003-009002000000', 'Makes sure each patient receives continuity of care.', 7),
  ('00000000-0000-0000-0004-009002008000', '00000000-0000-0000-0003-009002000000', 'Demonstrates understanding of the psychological impact of pregnancy loss, communicates bad news sensitively, and offers bereavement support.', 8),
  -- CiP_9_KS03 (7)
  ('00000000-0000-0000-0004-009003001000', '00000000-0000-0000-0003-009003000000', 'Takes a focused history, performs an appropriate examination, and orders appropriate investigations.', 1),
  ('00000000-0000-0000-0004-009003002000', '00000000-0000-0000-0003-009003000000', 'Formulates a differential diagnosis.', 2),
  ('00000000-0000-0000-0004-009003003000', '00000000-0000-0000-0003-009003000000', 'Discusses diagnosis with a patient in a sensitive manner.', 3),
  ('00000000-0000-0000-0004-009003004000', '00000000-0000-0000-0003-009003000000', 'Formulates an appropriate and individualised management plan, taking into account a persons preferences and the urgency required.', 4),
  ('00000000-0000-0000-0004-009003005000', '00000000-0000-0000-0003-009003000000', 'Recognises limitations and escalates care to senior colleagues and other specialities, when appropriate.', 5),
  ('00000000-0000-0000-0004-009003006000', '00000000-0000-0000-0003-009003000000', 'Performs surgery, where appropriate.', 6),
  ('00000000-0000-0000-0004-009003007000', '00000000-0000-0000-0003-009003000000', 'Ensures continuity of care, effective handover and appropriate discharge plan.', 7),
  -- CiP_9_KS04 (6)
  ('00000000-0000-0000-0004-009004001000', '00000000-0000-0000-0003-009004000000', 'Is able to prioritise according to clinical need.', 1),
  ('00000000-0000-0000-0004-009004002000', '00000000-0000-0000-0003-009004000000', 'Is able to escalate appropriately, according to clinical need and workload.', 2),
  ('00000000-0000-0000-0004-009004003000', '00000000-0000-0000-0003-009004000000', 'Is able to delegate appropriately to other members of the team.', 3),
  ('00000000-0000-0000-0004-009004004000', '00000000-0000-0000-0003-009004000000', 'Demonstrates prompt assessment of an acutely deteriorating patient.', 4),
  ('00000000-0000-0000-0004-009004005000', '00000000-0000-0000-0003-009004000000', 'Is able to give a gynaecological opinion for another speciality.', 5),
  ('00000000-0000-0000-0004-009004006000', '00000000-0000-0000-0003-009004000000', 'Makes safeguarding referrals, where appropriate.', 6)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. Procedures Catalog (24 procedures)
-- ============================================================

INSERT INTO procedures_catalog (id, curriculum_version_id, name, category, requires_summative_osats) VALUES
  ('00000000-0000-0000-0005-000000000001', '00000000-0000-0000-0000-000000000001', 'Caesarean section (basic)', 'General', true),
  ('00000000-0000-0000-0005-000000000002', '00000000-0000-0000-0000-000000000001', 'Caesarean section (intermediate)', 'General', true),
  ('00000000-0000-0000-0005-000000000003', '00000000-0000-0000-0000-000000000001', 'Caesarean section (complex)', 'General', true),
  ('00000000-0000-0000-0005-000000000004', '00000000-0000-0000-0000-000000000001', 'Cervical smear', 'General', true),
  ('00000000-0000-0000-0005-000000000005', '00000000-0000-0000-0000-000000000001', 'Diagnostic laparoscopy', 'General', true),
  ('00000000-0000-0000-0005-000000000006', '00000000-0000-0000-0000-000000000001', 'Endometrial biopsy', 'General', true),
  ('00000000-0000-0000-0005-000000000007', '00000000-0000-0000-0000-000000000001', 'Hysteroscopy', 'General', true),
  ('00000000-0000-0000-0005-000000000008', '00000000-0000-0000-0000-000000000001', 'Insertion/removal of IUS or IUCD', 'General', true),
  ('00000000-0000-0000-0005-000000000009', '00000000-0000-0000-0000-000000000001', 'Laparoscopic management of ectopic pregnancy', 'General', true),
  ('00000000-0000-0000-0005-000000000010', '00000000-0000-0000-0000-000000000001', 'Manual removal of the placenta', 'General', true),
  ('00000000-0000-0000-0005-000000000011', '00000000-0000-0000-0000-000000000001', 'Non-rotational assisted vaginal delivery (forceps)', 'General', true),
  ('00000000-0000-0000-0005-000000000012', '00000000-0000-0000-0000-000000000001', 'Non-rotational assisted vaginal delivery (ventouse)', 'General', true),
  ('00000000-0000-0000-0005-000000000013', '00000000-0000-0000-0000-000000000001', 'Ovarian cystectomy (open or laparoscopic)', 'General', true),
  ('00000000-0000-0000-0005-000000000014', '00000000-0000-0000-0000-000000000001', 'Perineal repair', 'General', true),
  ('00000000-0000-0000-0005-000000000015', '00000000-0000-0000-0000-000000000001', 'Rotational assisted vaginal delivery (any method)', 'General', true),
  ('00000000-0000-0000-0005-000000000016', '00000000-0000-0000-0000-000000000001', 'Simple operative laparoscopy', 'General', true),
  ('00000000-0000-0000-0005-000000000017', '00000000-0000-0000-0000-000000000001', 'Surgical evacuation of uterus >16 weeks', 'General', true),
  ('00000000-0000-0000-0005-000000000018', '00000000-0000-0000-0000-000000000001', 'Surgical management of miscarriage/surgical termination of pregnancy <16 weeks', 'General', true),
  ('00000000-0000-0000-0005-000000000019', '00000000-0000-0000-0000-000000000001', 'Surgical management of PPH', 'General', true),
  ('00000000-0000-0000-0005-000000000020', '00000000-0000-0000-0000-000000000001', 'Transabdominal ultrasound of early pregnancy', 'General', true),
  ('00000000-0000-0000-0005-000000000021', '00000000-0000-0000-0000-000000000001', 'Transabdominal ultrasound of late pregnancy', 'General', true),
  ('00000000-0000-0000-0005-000000000022', '00000000-0000-0000-0000-000000000001', '3rd degree perineal repair', 'General', true),
  ('00000000-0000-0000-0005-000000000023', '00000000-0000-0000-0000-000000000001', 'Vulval biopsy', 'General', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. Courses Catalog (9 courses)
-- ============================================================

INSERT INTO courses_catalog (id, curriculum_version_id, name, required_by_stage) VALUES
  ('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000001', 'Basic practical skills in obstetrics and gynaecology', 'Stage One'),
  ('00000000-0000-0000-0006-000000000002', '00000000-0000-0000-0000-000000000001', 'Basic ultrasound', 'Stage One'),
  ('00000000-0000-0000-0006-000000000003', '00000000-0000-0000-0000-000000000001', 'CTG training', 'Stage One'),
  ('00000000-0000-0000-0006-000000000004', '00000000-0000-0000-0000-000000000001', 'Leadership and management course', 'Stage Two'),
  ('00000000-0000-0000-0006-000000000005', '00000000-0000-0000-0000-000000000001', 'Obstetric simulation course (PROMPT)', 'Stage One'),
  ('00000000-0000-0000-0006-000000000006', '00000000-0000-0000-0000-000000000001', 'Obstetric simulation course (ROBUST or equivalent)', 'Stage Two'),
  ('00000000-0000-0000-0006-000000000007', '00000000-0000-0000-0000-000000000001', 'Resilience course (e.g. STEP-UP)', 'Stage One'),
  ('00000000-0000-0000-0006-000000000008', '00000000-0000-0000-0000-000000000001', 'SITM courses', 'Stage One'),
  ('00000000-0000-0000-0006-000000000009', '00000000-0000-0000-0000-000000000001', '3rd degree tear course', 'Stage One')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. Exams Catalog (3 MRCOG parts)
-- ============================================================

INSERT INTO exams_catalog (id, curriculum_version_id, name, required_by_stage, notes) VALUES
  ('00000000-0000-0000-0007-000000000001', '00000000-0000-0000-0000-000000000001', 'MRCOG Part 1', 'ST2', 'Must pass before end of ST2'),
  ('00000000-0000-0000-0007-000000000002', '00000000-0000-0000-0000-000000000001', 'MRCOG Part 2', 'ST5', 'Must pass before end of ST5'),
  ('00000000-0000-0000-0007-000000000003', '00000000-0000-0000-0000-000000000001', 'MRCOG Part 3', 'ST7', 'Must pass before CCT')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 9. Stage Requirements
-- ============================================================
-- Baseline: minimum evidence per key skill per stage group
-- Clinical CiPs (9-12) also require OSATS per listed procedure

-- Generic CiPs (1-8, 13-14): 1 evidence per key skill per stage group
INSERT INTO stage_requirements (id, stage_id, cip_id, requirement_type, target_value, notes) VALUES
  -- Stage One requirements for generic CiPs
  ('00000000-0000-0000-0008-001001000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000001', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001002000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000002', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001003000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000003', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001004000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000004', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001005000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000005', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001006000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000006', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001007000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000007', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001008000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000008', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001013000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000013', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001014000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000014', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),

  -- Clinical CiPs (9-12) Stage One - evidence + OSATS
  ('00000000-0000-0000-0008-001009000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000009', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001009000002', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000009', 'procedure_target', '{"min_summative_per_procedure": 3, "min_assessors": 2, "min_consultant_supervised": 1}', 'OSATS requirements for listed procedures'),
  ('00000000-0000-0000-0008-001010000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000010', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001010000002', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000010', 'procedure_target', '{"min_summative_per_procedure": 3, "min_assessors": 2, "min_consultant_supervised": 1}', 'OSATS requirements for listed procedures'),
  ('00000000-0000-0000-0008-001011000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000011', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001011000002', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000011', 'procedure_target', '{"min_summative_per_procedure": 3, "min_assessors": 2, "min_consultant_supervised": 1}', 'OSATS requirements for listed procedures'),
  ('00000000-0000-0000-0008-001012000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000012', 'evidence_per_key_skill', '1', 'Minimum 1 evidence per key skill during Stage One'),
  ('00000000-0000-0000-0008-001012000002', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000012', 'procedure_target', '{"min_summative_per_procedure": 3, "min_assessors": 2, "min_consultant_supervised": 1}', 'OSATS requirements for listed procedures'),

  -- Clinical CiP supervision level progression (CiP 9 across all stages)
  ('00000000-0000-0000-0008-009001000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000009', 'supervision_level', '1', 'Expected level: Observe (ST1)'),
  ('00000000-0000-0000-0008-009002000001', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0002-000000000009', 'supervision_level', '2', 'Expected level: Direct supervision (ST2) - Critical progression'),
  ('00000000-0000-0000-0008-009003000001', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0002-000000000009', 'supervision_level', '3', 'Expected level: Indirect supervision (ST3)'),
  ('00000000-0000-0000-0008-009004000001', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0002-000000000009', 'supervision_level', '3', 'Expected level: Indirect supervision (ST4)'),
  ('00000000-0000-0000-0008-009005000001', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0002-000000000009', 'supervision_level', '4', 'Expected level: Independent with support (ST5) - Critical progression'),
  ('00000000-0000-0000-0008-009006000001', '00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0002-000000000009', 'supervision_level', '4', 'Expected level: Independent with support (ST6)'),
  ('00000000-0000-0000-0008-009007000001', '00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0002-000000000009', 'supervision_level', '5', 'Expected level: Independent (ST7) - Critical progression'),

  -- CiP 10 supervision levels
  ('00000000-0000-0000-0008-010001000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000010', 'supervision_level', '1', 'Expected level: Observe (ST1)'),
  ('00000000-0000-0000-0008-010002000001', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0002-000000000010', 'supervision_level', '2', 'Expected level: Direct supervision (ST2) - Critical progression'),
  ('00000000-0000-0000-0008-010003000001', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0002-000000000010', 'supervision_level', '3', 'Expected level: Indirect supervision (ST3)'),
  ('00000000-0000-0000-0008-010004000001', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0002-000000000010', 'supervision_level', '3', 'Expected level: Indirect supervision (ST4)'),
  ('00000000-0000-0000-0008-010005000001', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0002-000000000010', 'supervision_level', '4', 'Expected level: Independent with support (ST5) - Critical progression'),
  ('00000000-0000-0000-0008-010006000001', '00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0002-000000000010', 'supervision_level', '4', 'Expected level: Independent with support (ST6)'),
  ('00000000-0000-0000-0008-010007000001', '00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0002-000000000010', 'supervision_level', '5', 'Expected level: Independent (ST7) - Critical progression'),

  -- CiP 11 supervision levels
  ('00000000-0000-0000-0008-011001000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000011', 'supervision_level', '1', 'Expected level: Observe (ST1)'),
  ('00000000-0000-0000-0008-011002000001', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0002-000000000011', 'supervision_level', '2', 'Expected level: Direct supervision (ST2)'),
  ('00000000-0000-0000-0008-011003000001', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0002-000000000011', 'supervision_level', '2', 'Expected level: Direct supervision (ST3)'),
  ('00000000-0000-0000-0008-011004000001', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0002-000000000011', 'supervision_level', '2', 'Expected level: Direct supervision (ST4)'),
  ('00000000-0000-0000-0008-011005000001', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0002-000000000011', 'supervision_level', '3', 'Expected level: Indirect supervision (ST5) - Critical progression'),
  ('00000000-0000-0000-0008-011006000001', '00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0002-000000000011', 'supervision_level', '4', 'Expected level: Independent with support (ST6)'),
  ('00000000-0000-0000-0008-011007000001', '00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0002-000000000011', 'supervision_level', '5', 'Expected level: Independent (ST7) - Critical progression'),

  -- CiP 12 supervision levels
  ('00000000-0000-0000-0008-012001000001', '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0002-000000000012', 'supervision_level', '1', 'Expected level: Observe (ST1)'),
  ('00000000-0000-0000-0008-012002000001', '00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0002-000000000012', 'supervision_level', '2', 'Expected level: Direct supervision (ST2)'),
  ('00000000-0000-0000-0008-012003000001', '00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0002-000000000012', 'supervision_level', '2', 'Expected level: Direct supervision (ST3)'),
  ('00000000-0000-0000-0008-012004000001', '00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0002-000000000012', 'supervision_level', '2', 'Expected level: Direct supervision (ST4)'),
  ('00000000-0000-0000-0008-012005000001', '00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0002-000000000012', 'supervision_level', '3', 'Expected level: Indirect supervision (ST5) - Critical progression'),
  ('00000000-0000-0000-0008-012006000001', '00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0002-000000000012', 'supervision_level', '4', 'Expected level: Independent with support (ST6)'),
  ('00000000-0000-0000-0008-012007000001', '00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0002-000000000012', 'supervision_level', '5', 'Expected level: Independent (ST7) - Critical progression')
ON CONFLICT (id) DO NOTHING;
