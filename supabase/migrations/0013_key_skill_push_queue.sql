-- Background push queue for confirmed cross-CiP key-skill suggestions.
-- One row per suggestion tracks whether it has been pushed back to Kaizen.

CREATE TABLE IF NOT EXISTS key_skill_review_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES key_skill_review_suggestions(id) ON DELETE CASCADE,
  review_entry_id uuid NOT NULL REFERENCES key_skill_review_entries(id) ON DELETE CASCADE,
  key_skill_id uuid NOT NULL REFERENCES key_skills(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'synced', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  queued_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_attempt_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (suggestion_id)
);

CREATE INDEX IF NOT EXISTS idx_ksr_push_queue_user_status
  ON key_skill_review_push_queue(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ksr_push_queue_entry
  ON key_skill_review_push_queue(review_entry_id);

DROP TRIGGER IF EXISTS trg_key_skill_review_push_queue_updated_at
  ON key_skill_review_push_queue;

CREATE TRIGGER trg_key_skill_review_push_queue_updated_at
BEFORE UPDATE ON key_skill_review_push_queue
FOR EACH ROW EXECUTE FUNCTION key_skill_review_set_updated_at();

ALTER TABLE key_skill_review_push_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own key skill push queue"
  ON key_skill_review_push_queue
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
