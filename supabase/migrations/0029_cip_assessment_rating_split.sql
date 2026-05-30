-- Split CiP assessment ratings into entrustment (clinical CiPs 9-12) and
-- meeting-expectations judgment (all CiPs).

ALTER TABLE cip_assessments
  ADD COLUMN IF NOT EXISTS trainee_entrustment integer
    CHECK (trainee_entrustment BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS es_entrustment integer
    CHECK (es_entrustment BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS es_meets_expectations boolean;

-- Best-effort backfill from legacy es_level / trainee_level columns.
UPDATE cip_assessments
SET
  es_entrustment = es_level,
  es_meets_expectations = COALESCE(es_meets_expectations, true)
WHERE cip_number BETWEEN 9 AND 12
  AND es_level BETWEEN 1 AND 5
  AND es_entrustment IS NULL;

UPDATE cip_assessments
SET trainee_entrustment = trainee_level
WHERE cip_number BETWEEN 9 AND 12
  AND trainee_level BETWEEN 1 AND 5
  AND trainee_entrustment IS NULL;

UPDATE cip_assessments
SET es_meets_expectations = (es_level >= 1)
WHERE cip_number IS NOT NULL
  AND cip_number NOT BETWEEN 9 AND 12
  AND es_level IS NOT NULL
  AND es_meets_expectations IS NULL;

UPDATE cip_assessments
SET es_meets_expectations = true
WHERE cip_number BETWEEN 9 AND 12
  AND status = 'complete'
  AND es_meets_expectations IS NULL
  AND (es_entrustment IS NOT NULL OR es_level IS NOT NULL);
