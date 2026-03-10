SELECT 'cips' as tbl, count(*) FROM cips
UNION ALL SELECT 'key_skills', count(*) FROM key_skills
UNION ALL SELECT 'descriptors', count(*) FROM descriptors
UNION ALL SELECT 'procedures_catalog', count(*) FROM procedures_catalog
UNION ALL SELECT 'stages', count(*) FROM stages
UNION ALL SELECT 'courses_catalog', count(*) FROM courses_catalog
UNION ALL SELECT 'exams_catalog', count(*) FROM exams_catalog;
