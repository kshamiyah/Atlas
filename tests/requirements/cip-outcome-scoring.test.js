import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScanInput,
  computeReadiness,
  resolveCipAssessmentTrainingYear,
} from "../../../portfolioiq-extension/readiness/compute-readiness.js";
import { isCipAssessmentListEntry } from "../../../portfolioiq-extension/readiness/smart-search-scrape.js";

function buildStrongPortfolioInput(overrides = {}) {
  return {
    source: "scan",
    current_stage: "ST4",
    covered_key_skills: 74,
    total_key_skills: 75,
    cip_assessments: [],
    cip_coverage: Array.from({ length: 14 }, (_, index) => ({
      cip_number: index + 1,
      skills_covered: 5,
      skills_total: 5,
    })),
    entries: [],
    all_entries: [
      { assessmentType: "Team Observation Form 2 (TO2)", status: "complete" },
      { assessmentType: "Team Observation Form 2 (TO2)", status: "complete" },
    ],
    ...overrides,
  };
}

describe("isCipAssessmentListEntry", () => {
  it("matches CiP assessment links discovered on CiP detail pages", () => {
    assert.equal(
      isCipAssessmentListEntry({
        name: "Self assessment for CiP 7",
        assessmentType: "CiP assessment",
      }),
      true,
    );
  });

  it("does not treat linked evidence such as CBD as a CiP assessment", () => {
    assert.equal(
      isCipAssessmentListEntry({
        name: "Case-based Discussion",
        assessmentType: "CBD",
        linkedCipNumber: 7,
      }),
      false,
    );
  });
});

describe("resolveCipAssessmentTrainingYear", () => {
  it("reads trainee grade from extracted fields when list year is missing", () => {
    assert.equal(
      resolveCipAssessmentTrainingYear(
        {
          extractedFields: { "trainee grade": "ST1" },
        },
        "ST1",
      ),
      "ST1",
    );
  });

  it("falls back to the current stage when no year is scraped", () => {
    assert.equal(resolveCipAssessmentTrainingYear({}, "ST1"), "ST1");
  });
});

describe("buildScanInput CiP assessments", () => {
  it("keeps CiP assessments found via grade-scoped search when only trainee grade is scraped", () => {
    const input = buildScanInput({
      profile: { current_grade: "ST1" },
      cip_details: [],
      entries: [
        {
          detectedEntryType: "cip_assessment",
          name: "Assessment for CiP 7: Innovation and research",
          cip_number: 7,
          status: "complete",
          es_meets_expectations: true,
          extractedFields: { "trainee grade": "ST1" },
        },
        {
          detectedEntryType: "cip_assessment",
          name: "Assessment for CiP 9: Emergency gynaecology",
          cip_number: 9,
          status: "complete",
          es_meets_expectations: true,
          es_entrustment: 1,
          extractedFields: { "trainee grade": "ST1" },
        },
      ],
    });

    assert.equal(input.cip_assessments.length, 2);
    assert.equal(input.cip_assessments[0]?.training_year, "ST1");
  });
});

describe("computeReadiness CiP outcome scoring", () => {
  it("does not predict Outcome 1 when all CiP assessments are missing", () => {
    const report = computeReadiness(buildStrongPortfolioInput());

    assert.equal(report.cip_assessment_report.complete, 0);
    assert.ok(report.predicted_outcome >= 3);
    assert.ok(
      report.blockers.some((blocker) => blocker.includes("CiP assessment")),
    );
  });

  it("raises the outcome floor when some CiP assessments are missing", () => {
    const report = computeReadiness(
      buildStrongPortfolioInput({
        cip_assessments: Array.from({ length: 10 }, (_, index) => {
          const cip_number = index + 1;
          return {
            cip_number,
            training_year: "ST4",
            status: "complete",
            es_meets_expectations: true,
            ...(cip_number >= 7 ? { es_entrustment: 2 } : {}),
          };
        }),
      }),
    );

    assert.equal(report.cip_assessment_report.complete, 10);
    assert.ok(report.predicted_outcome >= 2);
  });
});
