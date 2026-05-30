import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCipAssessmentKpis,
  indexBestCipAssessmentsByNumber,
  mergeEvidenceAndAssessmentRag,
  summarizeCipAssessment,
} from "../../lib/progress/cip-assessment-metrics";

describe("cip-assessment-metrics", () => {
  it("prefers complete assessment rows when indexing by CiP number", () => {
    const indexed = indexBestCipAssessmentsByNumber([
      { cip_number: 11, es_meets_expectations: null, es_entrustment: null, status: "pending" },
      { cip_number: 11, es_meets_expectations: true, es_entrustment: 1, status: "complete", date: "2026-01-01" },
    ]);

    assert.equal(indexed.get(11)?.status, "complete");
    assert.equal(indexed.get(11)?.es_entrustment, 1);
  });

  it("flags clinical CiP below expected entrustment", () => {
    const summary = summarizeCipAssessment({
      cipNumber: 10,
      record: {
        cip_number: 10,
        es_entrustment: 1,
        es_meets_expectations: true,
        status: "complete",
      },
      stage: "ST2",
      expectations: new Map([[10, new Map([["ST2", 2]])]]),
    });

    assert.equal(summary.status, "below_entrustment");
  });

  it("counts complete and on-track CiP assessments", () => {
    const assessmentsByNumber = indexBestCipAssessmentsByNumber([
      { cip_number: 1, es_meets_expectations: true, status: "complete" },
      { cip_number: 9, es_entrustment: 1, es_meets_expectations: true, status: "complete" },
      { cip_number: 11, status: "pending" },
    ]);

    const kpis = computeCipAssessmentKpis({
      cipNumbers: [1, 9, 11],
      assessmentsByNumber,
      stage: "ST1",
      expectations: new Map([[9, new Map([["ST1", 1]])]]),
    });

    assert.equal(kpis.complete.covered, 2);
    assert.equal(kpis.complete.total, 3);
    assert.equal(kpis.on_track.covered, 2);
    assert.equal(kpis.byNumber.get(11)?.status, "missing");
  });

  it("downgrades overall CiP status when assessment is missing at waypoint", () => {
    const merged = mergeEvidenceAndAssessmentRag("green", "missing", "waypoint");
    assert.equal(merged, "red");
  });
});
