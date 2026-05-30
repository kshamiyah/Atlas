import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTo1TeamObservationEvidence,
  isTo2Evidence,
  needsLightweightStatusRefresh,
} from "../../lib/kaizen/evidence-eligibility.ts";

describe("evidence eligibility — team observation", () => {
  it("detects TO2 but not TO1", () => {
    assert.equal(
      isTo2Evidence("other_evidence", "Team Observation Form 2 (TO2)", "TO2 for TO1"),
      true,
    );
    assert.equal(
      isTo2Evidence("other_evidence", "Team Observation Form 1 (TO1)", "Team Observation 1"),
      false,
    );
    assert.equal(
      isTo1TeamObservationEvidence(
        "other_evidence",
        "Team Observation Form 1 (TO1)",
        "Team Observation 1",
      ),
      true,
    );
    assert.equal(
      isTo1TeamObservationEvidence("other_evidence", "Team Observation Form 2 (TO2)", "TO2 for TO1"),
      false,
    );
  });

  it("does not queue TO1 for lightweight refresh", () => {
    assert.equal(
      needsLightweightStatusRefresh({
        detected_entry_type: "other_evidence",
        assessment_type: "Team Observation Form 1 (TO1)",
        title: "Team Observation 1",
        status: "",
      }),
      false,
    );
    assert.equal(
      needsLightweightStatusRefresh({
        detected_entry_type: "other_evidence",
        assessment_type: "Team Observation Form 2 (TO2)",
        title: "TO2 for TO1",
        status: "",
      }),
      true,
    );
  });
});
