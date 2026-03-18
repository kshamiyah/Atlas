-- Descriptor-level coverage results per entry × key skill

CREATE TABLE key_skill_descriptor_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  review_entry_id uuid REFERENCES key_skill_review_entries(id) ON DELETE CASCADE NOT NULL,
  key_skill_id uuid REFERENCES key_skills(id) ON DELETE CASCADE NOT NULL,
  descriptor_id uuid REFERENCES descriptors(id) ON DELETE CASCADE NOT NULL,
  covered boolean NOT NULL DEFAULT false,
  confidence numeric(4,3),          -- 0.000–1.000
  evidence_quote text,              -- short quote from entry text (max 500 chars)
  method text NOT NULL DEFAULT 'ai' CHECK (method IN ('ai', 'user')),
  analysed_at timestamptz DEFAULT timezone('utc', now()),
  UNIQUE (user_id, review_entry_id, key_skill_id, descriptor_id)
);

ALTER TABLE key_skill_descriptor_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own coverage"
  ON key_skill_descriptor_coverage FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
