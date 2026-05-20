-- Enable Row Level Security on reference/catalog tables
-- These tables contain curriculum data that should be readable by all authenticated users
-- but not modifiable through the PostgREST API

-- curriculum_versions
ALTER TABLE curriculum_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read curriculum_versions"
  ON curriculum_versions FOR SELECT
  USING (auth.role() = 'authenticated');

-- cips
ALTER TABLE cips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cips"
  ON cips FOR SELECT
  USING (auth.role() = 'authenticated');

-- key_skills
ALTER TABLE key_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read key_skills"
  ON key_skills FOR SELECT
  USING (auth.role() = 'authenticated');

-- descriptors
ALTER TABLE descriptors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read descriptors"
  ON descriptors FOR SELECT
  USING (auth.role() = 'authenticated');

-- procedures_catalog
ALTER TABLE procedures_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read procedures_catalog"
  ON procedures_catalog FOR SELECT
  USING (auth.role() = 'authenticated');

-- stages
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read stages"
  ON stages FOR SELECT
  USING (auth.role() = 'authenticated');

-- stage_requirements
ALTER TABLE stage_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read stage_requirements"
  ON stage_requirements FOR SELECT
  USING (auth.role() = 'authenticated');

-- courses_catalog
ALTER TABLE courses_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read courses_catalog"
  ON courses_catalog FOR SELECT
  USING (auth.role() = 'authenticated');

-- exams_catalog
ALTER TABLE exams_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exams_catalog"
  ON exams_catalog FOR SELECT
  USING (auth.role() = 'authenticated');
