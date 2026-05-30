import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAheadOfStageItems } from "../../../portfolioiq-extension/readiness/compute-readiness.js";

describe("buildAheadOfStageItems", () => {
  it("lists summative OSATS complete before their due stage", () => {
    const items = buildAheadOfStageItems("ST1", {
      entries: [
        {
          detected_entry_type: "osats_summative",
          kaizen_procedure_id: 463,
          assessor_role_id: 597,
        },
        {
          detected_entry_type: "osats_summative",
          kaizen_procedure_id: 463,
          assessor_role_id: 597,
        },
        {
          detected_entry_type: "osats_summative",
          kaizen_procedure_id: 463,
          assessor_role_id: 597,
        },
      ],
      entryTitlesLower: new Set(),
      evidenceTypesLower: new Set(),
      completedExamTypes: new Set(),
      proRata: { onTrack: false },
      keySkillsContext: { uses_stage_pace: true },
      cipAssessments: [],
    });

    assert.equal(items.some((item) => item.category === "osats" && item.name.includes("Caesarean")), true);
    assert.equal(items.find((item) => item.category === "osats")?.due_at, "ST2");
  });

  it("does not list OSATS that are only due at the current stage", () => {
    const items = buildAheadOfStageItems("ST2", {
      entries: [
        {
          detected_entry_type: "osats_summative",
          kaizen_procedure_id: 450,
          assessor_role_id: 597,
        },
      ],
      entryTitlesLower: new Set(),
      evidenceTypesLower: new Set(),
      completedExamTypes: new Set(),
      proRata: {},
      keySkillsContext: {},
      cipAssessments: [],
    });

    assert.equal(items.some((item) => item.category === "osats" && item.name.includes("Cervical smear")), false);
  });
});
