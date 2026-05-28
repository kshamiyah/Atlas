import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRequirementsSummary,
  buildReviewStatusSummary,
  buildYearEvidenceCounts,
  defaultViewForYear,
  entryInPostWindow,
  filterKaizenEntriesForYear,
  findPostForYear,
  isRetrospectiveYear,
  listAvailableTrainingYears,
  scopeRequirementsByYear,
  summarizeActivityByMonth,
  summarizeEntryTypes,
} from "../../lib/progress/year-portfolio";

test("findPostForYear matches normalized grade and ISO dates", () => {
  const post = findPostForYear(
    [
      {
        grade: "st1",
        post_start: "01/08/2023",
        post_end: "31/07/2024",
        hospital: "Royal London",
        trust: "Barts",
      },
    ],
    "ST1",
  );

  assert.equal(post?.grade, "ST1");
  assert.equal(post?.post_start, "2023-08-01");
  assert.equal(post?.post_end, "2024-07-31");
  assert.equal(post?.hospital, "Royal London");
});

test("filterKaizenEntriesForYear prefers post window when available", () => {
  const post = findPostForYear(
    [{ grade: "ST1", post_start: "2023-08-01", post_end: "2024-07-31" }],
    "ST1",
  );
  const entries = [
    { id: "1", kaizen_date: "15/09/2023", training_year: "ST1" },
    { id: "2", kaizen_date: "10/01/2025", training_year: "ST1" },
    { id: "3", kaizen_date: "10/01/2025", training_year: "ST2" },
  ];

  const scoped = filterKaizenEntriesForYear(entries, "ST1", post);
  assert.deepEqual(
    scoped.map((entry) => entry.id),
    ["1"],
  );
});

test("filterKaizenEntriesForYear falls back to training year", () => {
  const scoped = filterKaizenEntriesForYear(
    [
      { id: "1", kaizen_date: "15/09/2023", training_year: "ST1" },
      { id: "2", kaizen_date: "10/01/2025", training_year: "ST2" },
    ],
    "ST1",
    null,
  );
  assert.deepEqual(
    scoped.map((entry) => entry.id),
    ["1"],
  );
});

test("entryInPostWindow handles inclusive boundaries", () => {
  const post = { post_start: "2023-08-01", post_end: "2024-07-31" };
  assert.equal(entryInPostWindow("2023-08-01", post), true);
  assert.equal(entryInPostWindow("2024-07-31", post), true);
  assert.equal(entryInPostWindow("2024-08-01", post), false);
});

test("scopeRequirementsByYear and summary helpers", () => {
  const scoped = scopeRequirementsByYear(
    [
      { required_by_stage: "ST1", complete: true, name: "A" },
      { required_by_stage: "ST2", complete: false, name: "B" },
    ],
    "ST1",
  );
  assert.equal(scoped.length, 1);
  assert.deepEqual(
    buildRequirementsSummary(scoped, scoped, []),
    {
      procedures_complete: 1,
      procedures_total: 1,
      courses_complete: 1,
      courses_total: 1,
      exams_complete: 0,
      exams_total: 0,
    },
  );
});

test("summarizeEntryTypes counts detected entry types", () => {
  assert.deepEqual(
    summarizeEntryTypes([
      { id: "1", kaizen_date: null, training_year: "ST1", detected_entry_type: "cbd" },
      { id: "2", kaizen_date: null, training_year: "ST1", detected_entry_type: "cbd" },
      { id: "3", kaizen_date: null, training_year: "ST1", assessment_type: "Reflection" },
    ]),
    { cbd: 2, Reflection: 1 },
  );
});

test("retrospective helpers", () => {
  assert.equal(isRetrospectiveYear("ST1", "ST3"), true);
  assert.equal(isRetrospectiveYear("ST3", "ST3"), false);
  assert.equal(defaultViewForYear("ST1", "ST3"), "snapshot");
  assert.equal(defaultViewForYear("ST3", "ST3"), "priorities");
});

test("buildYearEvidenceCounts compares post window and training year tags", () => {
  const post = findPostForYear(
    [{ grade: "ST1", post_start: "2023-08-01", post_end: "2024-07-31" }],
    "ST1",
  );
  const entries = [
    { id: "1", kaizen_date: "2023-09-01", training_year: "ST1" },
    { id: "2", kaizen_date: "2025-01-01", training_year: "ST1" },
  ];
  const counts = buildYearEvidenceCounts(entries, "ST1", post);
  assert.equal(counts.primary, 1);
  assert.equal(counts.by_post_window, 1);
  assert.equal(counts.by_training_year, 2);
  assert.equal(counts.scope_method, "post_window");
});

test("summarizeActivityByMonth groups dated entries", () => {
  const rows = summarizeActivityByMonth([
    { id: "1", kaizen_date: "2023-09-15", training_year: "ST1" },
    { id: "2", kaizen_date: "2023-09-20", training_year: "ST1" },
    { id: "3", kaizen_date: "2024-01-10", training_year: "ST1" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.count, 2);
});

test("buildReviewStatusSummary derives awaiting review counts", () => {
  const scoped = new Set(["a", "b", "c"]);
  const confirmed = new Set(["a", "b"]);
  const summary = buildReviewStatusSummary({
    scopedReviewEntryIds: scoped,
    entriesWithConfirmed: confirmed,
    pendingSuggestions: 4,
  });
  assert.equal(summary.entries_awaiting_review, 1);
  assert.equal(summary.review_completion_pct, 67);
});

test("listAvailableTrainingYears preserves curriculum order", () => {
  const years = listAvailableTrainingYears(
    [{ grade: "ST3", post_start: "2024-08-01", post_end: "2025-07-31" }],
    [{ id: "1", kaizen_date: "2023-01-01", training_year: "ST1" }],
  );
  assert.deepEqual(years, ["ST1", "ST3"]);
});
