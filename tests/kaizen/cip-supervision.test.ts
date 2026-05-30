import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateClinicalEntrustment,
  formatEntrustmentLevel,
  formatMeetsExpectations,
  getExpectedClinicalEntrustment,
  isCipAssessmentComplete,
  isClinicalCip,
  parseEntrustmentLevel,
  parseMeetsExpectations,
} from "../../lib/kaizen/cip-supervision";

test("identifies clinical CiPs", () => {
  assert.equal(isClinicalCip(10), true);
  assert.equal(isClinicalCip(7), false);
});

test("returns matrix expected entrustment per CiP and stage", () => {
  assert.equal(getExpectedClinicalEntrustment(10, "ST1"), 1);
  assert.equal(getExpectedClinicalEntrustment(10, "ST6"), 4);
  assert.equal(getExpectedClinicalEntrustment(11, "ST4"), 2);
  assert.equal(getExpectedClinicalEntrustment(7, "ST1"), null);
});

test("parses entrustment and meeting-expectations text", () => {
  assert.equal(parseEntrustmentLevel("Level 2: Entrusted to act under direct supervision"), 2);
  assert.equal(parseMeetsExpectations("Meeting expectations"), true);
  assert.equal(parseMeetsExpectations("Below expectations"), false);
});

test("formats entrustment and meeting-expectations labels", () => {
  assert.match(formatEntrustmentLevel(1) ?? "", /Level 1: Entrusted to observe/);
  assert.equal(formatMeetsExpectations(true), "Meeting expectations");
});

test("evaluates clinical entrustment separately from meeting expectations", () => {
  const result = evaluateClinicalEntrustment({
    assessments: [
      { cip_number: 10, es_entrustment: 1, es_meets_expectations: true },
      { cip_number: 7, es_meets_expectations: false },
      { cip_number: 11, es_entrustment: 1, es_meets_expectations: true },
    ],
    stage: "ST2",
  });

  assert.deepEqual(result.cipsBelowEntrustment, [10, 11]);
  assert.deepEqual(result.cipsBelowExpectations, [7]);
  assert.equal(result.entrustmentGap, 2);
});

test("clinical CiP assessment requires ES entrustment and meeting expectations to be complete", () => {
  assert.equal(
    isCipAssessmentComplete({
      cip_number: 11,
      status: "pending",
      trainee_entrustment: 1,
      es_entrustment: null,
      es_meets_expectations: null,
    }),
    false,
  );

  assert.equal(
    isCipAssessmentComplete({
      cip_number: 10,
      status: "complete",
      trainee_entrustment: 2,
      es_entrustment: 1,
      es_meets_expectations: true,
    }),
    true,
  );
});
