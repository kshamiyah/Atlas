import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTeamObservationSummary,
  classifyTeamObservationEntry,
  isTeamObservationComplete,
  scopeTeamObservationSummaryForYear,
  TO2_TARGET_PER_TRAINING_YEAR,
} from "../../lib/requirements/team-observation-evidence";

describe("team observation detection", () => {
  it("separates self TO1, assessor TO1, and TO2", () => {
    assert.equal(
      classifyTeamObservationEntry({ title: "Self Observation Form (Self TO1)" }),
      "self_to1",
    );
    assert.equal(classifyTeamObservationEntry({ title: "Team Observation 1" }), "assessor_to1");
    assert.equal(classifyTeamObservationEntry({ title: "Team Observation 2" }), "to2");
    assert.equal(
      classifyTeamObservationEntry({ title: "TO2 for TO1 (Second Assessment)" }),
      "to2",
    );
    assert.equal(
      classifyTeamObservationEntry({ title: "Team Observation Form 2 (TO2)" }),
      "to2",
    );
    assert.equal(
      classifyTeamObservationEntry({
        title: "Team observation feedback",
        assessorName: "Dr Smith",
      }),
      "assessor_to1",
    );
  });

  it("counts completed TO2 summaries from ePortfolio titles", () => {
    const summary = buildTeamObservationSummary(
      [
        {
          title: "TO2 for TO1 (Second Assessment)",
          training_year: "ST1",
          status: "complete",
          lastUpdated: "19 Mar 2026",
        },
        {
          title: "Team Observation Form 2 (TO2)",
          training_year: "ST1",
          status: "Complete",
          lastUpdated: "1 Sep 2025",
        },
      ],
      { trainingYear: "ST1", target: TO2_TARGET_PER_TRAINING_YEAR },
    );

    assert.equal(summary.complete, 2);
    assert.equal(summary.complete_to2, 2);
    assert.equal(summary.complete_source, "to2");
    assert.equal(summary.complete_requirement, true);
  });

  it("recognises completed statuses", () => {
    assert.equal(isTeamObservationComplete("Complete"), true);
    assert.equal(isTeamObservationComplete("Signed off"), true);
    assert.equal(isTeamObservationComplete("In progress"), false);
  });
});

describe("buildTeamObservationSummary", () => {
  it("counts completed TO2 and Self TO1 for the training year", () => {
    const summary = buildTeamObservationSummary(
      [
        { title: "Self Observation Form (Self TO1)", training_year: "ST1", status: "Complete", lastUpdated: "1 Sep 2025" },
        { title: "Self Observation Form (Self TO1)", training_year: "ST1", status: "Complete", lastUpdated: "1 Mar 2026" },
        { title: "Team Observation 1", training_year: "ST1", status: "Complete", assessorName: "A" },
        { title: "Team Observation 1", training_year: "ST1", status: "Complete", assessorName: "B" },
        { title: "Team Observation 2", training_year: "ST1", status: "In progress" },
      ],
      { trainingYear: "ST1", target: TO2_TARGET_PER_TRAINING_YEAR },
    );

    assert.equal(summary.complete, 2);
    assert.equal(summary.complete_self_to1, 2);
    assert.equal(summary.complete_to2, 0);
    assert.equal(summary.listed_assessor_to1, 2);
    assert.equal(summary.complete_source, "self_to1");
    assert.equal(summary.complete_requirement, true);
  });

  it("does not count colleague TO1 forms toward the requirement", () => {
    const summary = buildTeamObservationSummary(
      Array.from({ length: 5 }, (_, index) => ({
        title: "Team Observation 1",
        training_year: "ST1",
        status: "Complete",
        assessorName: `Colleague ${index + 1}`,
      })),
      { trainingYear: "ST1", target: TO2_TARGET_PER_TRAINING_YEAR },
    );

    assert.equal(summary.complete, 0);
    assert.equal(summary.listed_assessor_to1, 5);
    assert.equal(summary.items.length, 0);
  });

  it("includes TO2 without a date when the post grade matches the training year", () => {
    const summary = buildTeamObservationSummary(
      [
        {
          title: "TO2 for TO1 (Second Assessment)",
          status: "Complete",
        },
      ],
      {
        trainingYear: "ST1",
        posts: [{ grade: "ST1", post_start: "2025-08-01", post_end: "2026-07-31" }],
      },
    );

    assert.equal(summary.complete, 1);
    assert.equal(summary.items.length, 1);
  });

  it("scopes summaries by selected year", () => {
    const summary = buildTeamObservationSummary(
      [
        {
          title: "Team Observation 2",
          training_year: "ST1",
          status: "Complete",
          lastUpdated: "1 Sep 2025",
        },
        {
          title: "Team Observation 2",
          training_year: "ST2",
          status: "Complete",
          lastUpdated: "1 Sep 2026",
        },
      ],
    );

    const scoped = scopeTeamObservationSummaryForYear(summary, "ST2");
    assert.equal(scoped.complete, 1);
    assert.equal(scoped.items.length, 1);
    assert.equal(scoped.items[0]?.training_year, "ST2");
  });

  it("excludes entries whose title names a different training stage", () => {
    const summary = buildTeamObservationSummary(
      [
        {
          title: "TO1 for Self TO1 ST4",
          status: "Complete",
          lastUpdated: "1 Jan 2026",
        },
        {
          title: "TO2 for TO1 (Second Assessment)",
          training_year: "ST1",
          status: "Complete",
          lastUpdated: "19 Mar 2026",
        },
      ],
      { trainingYear: "ST1" },
    );

    assert.equal(summary.items.length, 1);
    assert.equal(summary.items[0]?.title, "TO2 for TO1 (Second Assessment)");
  });

  it("dedupes duplicate scrape rows and prefers complete metadata", () => {
    const summary = buildTeamObservationSummary(
      [
        {
          title: "TO2 for TO1 (Second Assessment)",
          status: "Complete",
          lastUpdated: "19 Mar 2026",
        },
        {
          title: "TO2 for TO1 (Second Assessment)",
          status: "Unknown",
        },
        {
          title: "TO2 for TO1",
          status: "Complete",
          lastUpdated: "4 Nov 2025",
        },
      ],
      { trainingYear: "ST1" },
    );

    assert.equal(summary.complete, 2);
    assert.equal(summary.items.length, 2);
    assert.equal(summary.items.every((item) => item.complete), true);
  });

  it("hides incomplete self TO1 rows when a complete TO2 exists for the same round", () => {
    const summary = buildTeamObservationSummary(
      [
        {
          title: "TO1 (Second Assessment)",
          status: "Unknown",
          lastUpdated: "19 Mar 2026",
        },
        {
          title: "TO2 for TO1 (Second Assessment)",
          status: "Complete",
          lastUpdated: "19 Mar 2026",
        },
        {
          title: "TO2 for TO1",
          status: "Complete",
          lastUpdated: "4 Nov 2025",
        },
      ],
      { trainingYear: "ST1" },
    );

    assert.equal(summary.complete, 2);
    assert.equal(summary.items.length, 2);
    assert.ok(summary.items.every((item) => item.kind === "to2"));
  });
});
