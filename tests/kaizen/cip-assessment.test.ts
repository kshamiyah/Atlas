import test from "node:test";
import assert from "node:assert/strict";
import {
  inferDetectedEntryType,
  isCipAssessmentEntry,
  parseCipAssessmentFromEntry,
  parseCipNameFromAssessmentTitle,
  parseCipNumber,
  resolveCipAssessmentDisplayStatus,
  cipAssessmentToBrowsableEntry,
} from "../../lib/kaizen/cip-assessment";

test("identifies CiP assessments from Kaizen list metadata", () => {
  assert.equal(
    inferDetectedEntryType(
      "CiP assessment",
      "Assessment for CiP 7: Innovation and research for: Dr Example",
    ),
    "cip_assessment",
  );
  assert.equal(parseCipNumber("Assessment for CiP 7: Innovation and research"), 7);
  assert.equal(
    parseCipNameFromAssessmentTitle(
      "Assessment for CiP 13: Non-discrimination and inclusion for: Dr Example",
    ),
    "Non-discrimination and inclusion",
  );
});

test("parses generic CiP meeting-expectations assessment", () => {
  const parsed = parseCipAssessmentFromEntry({
    title: "Assessment for CiP 7: Innovation and research for: Dr Example",
    extracted_fields: {
      "cip definition": "CiP 7: Innovation and research (1424)",
      "cip global judgment": "Meeting expectations",
      "trainee comments": "Trainee narrative",
      "further comments": "Well above expectations",
      "the current status of this assessment request": "Complete",
    },
  });

  assert.equal(parsed.cip_number, 7);
  assert.equal(parsed.es_entrustment, null);
  assert.equal(parsed.es_meets_expectations, true);
  assert.equal(parsed.status, "complete");
});

test("parses clinical CiP entrustment and meeting expectations separately", () => {
  const parsed = parseCipAssessmentFromEntry({
    title: "Assessment for CiP 10: Emergency obstetrics for: Dr Example",
    cip_number: 10,
    extracted_fields: {
      "for this year of training, i consider my performance for this clinical cip to be":
        "Level 2: Entrusted to act under direct supervision",
      "based on the trainee self assessment and the evidence provided, i consider the trainee s performance for this clinical cip to be":
        "Level 1: Entrusted to observe",
      "cip global judgment": "Meeting expectations",
      "the current status of this assessment request": "Complete",
    },
  });

  assert.equal(parsed.trainee_entrustment, 2);
  assert.equal(parsed.es_entrustment, 1);
  assert.equal(parsed.es_meets_expectations, true);
});

test("maps cip assessments into browsable entry rows", () => {
  const row = cipAssessmentToBrowsableEntry({
    id: "abc",
    kaizen_entry_id: "1924216",
    cip_number: 10,
    cip_kaizen_id: 1424,
    cip_name: "Emergencies in obstetrics",
    date: "2026-05-05",
    trainee_entrustment: 2,
    trainee_level: 2,
    trainee_comments: "Trainee narrative",
    es_agrees: true,
    es_entrustment: 1,
    es_meets_expectations: true,
    es_level: 1,
    es_comments: "Well above expectations",
    status: "complete",
    updated_at: "2026-05-28T12:00:00.000Z",
  });

  assert.match(String(row.extracted_fields?.["es entrustment"] ?? ""), /Level 1:/);
  assert.equal(row.extracted_fields?.["meeting expectations"], "Meeting expectations");
});

test("infers complete status when ES entrustment is recorded", () => {
  assert.equal(
    resolveCipAssessmentDisplayStatus({
      id: "x",
      kaizen_entry_id: null,
      cip_number: 10,
      cip_kaizen_id: null,
      cip_name: null,
      date: null,
      trainee_entrustment: null,
      trainee_level: null,
      trainee_comments: null,
      es_agrees: null,
      es_entrustment: 1,
      es_meets_expectations: null,
      es_level: 1,
      es_comments: null,
      status: "pending",
      updated_at: null,
    }),
    "complete",
  );
});
