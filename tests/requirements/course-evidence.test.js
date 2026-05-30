import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COURSES } from "../../../portfolioiq-extension/readiness/curriculum-bundle.js";
import { buildAheadOfStageItems } from "../../../portfolioiq-extension/readiness/compute-readiness.js";
import {
  assignCourseEntries,
  collectCourseEvidenceEntries,
  courseMatchedByEntries,
  courseMatchedForAheadOfStage,
  isCourseAheadOfStage,
  isCourseEvidenceEntry,
  isCourseRequirementMet,
} from "../../../portfolioiq-extension/readiness/course-evidence.js";
import { resolveCoursesFilterUrl } from "../../../portfolioiq-extension/readiness/smart-search-scrape.js";

const USER_CATALOG = {
  filters: [
    {
      label: "ST1 ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=aggregated_field_grade%3A71",
    },
    {
      label: "Other evidence ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=log_entry%3Alogentry_other_evidence",
    },
    {
      label: "Courses ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=field_logentry_evidence_type%3A1044",
    },
  ],
};

const ST1_COURSE_ENTRIES = [
  {
    _scanFilter: "courses",
    name: "Basic practical skills in obstetrics and gynaecology",
    year: "ST1",
    extractedFields: { "evidence type": "Courses" },
  },
  {
    _scanFilter: "courses",
    name: "CTG training",
    year: "ST1",
    extractedFields: { "evidence type": "Courses" },
  },
  {
    _scanFilter: "courses",
    name: "PROMPT",
    year: "ST1",
    extractedFields: {
      "evidence type": "Courses",
      description:
        "I recently attended the PROMPT (Practical Obstetric Multi-Professional Training) course.",
    },
  },
];

describe("isCourseEvidenceEntry", () => {
  it("accepts course log entries tagged by the courses smart-scan filter", () => {
    assert.equal(isCourseEvidenceEntry({ _scanFilter: "courses" }), true);
  });

  it("accepts other evidence rows with evidence type Courses", () => {
    assert.equal(
      isCourseEvidenceEntry({
        detected_entry_type: "other_evidence",
        extractedFields: { "evidence type": "Courses" },
      }),
      true,
    );
  });

  it("rejects unrelated other evidence mentioning leadership", () => {
    assert.equal(
      isCourseEvidenceEntry({
        detected_entry_type: "other_evidence",
        name: "Leadership conference attendance",
        extractedFields: { "evidence type": "Conference" },
      }),
      false,
    );
  });
});

describe("assignCourseEntries", () => {
  it("assigns each ST1 log to one requirement and leaves ROBUST unassigned", () => {
    const assignments = assignCourseEntries(COURSES, ST1_COURSE_ENTRIES, {
      currentStage: "ST1",
    });
    const promptCourse = COURSES.find(
      (course) => course.variant === "prompt",
    );
    const robustCourse = COURSES.find(
      (course) => course.variant === "robust",
    );

    assert.equal(isCourseRequirementMet(promptCourse, assignments), true);
    assert.equal(isCourseRequirementMet(robustCourse, assignments), false);
    assert.equal(assignments.assignmentsByEntry.size, 3);
  });

  it("does not assign a PROMPT ST1 log to ST3 ROBUST", () => {
    const assignments = assignCourseEntries(COURSES, [ST1_COURSE_ENTRIES[2]], {
      currentStage: "ST1",
    });
    const robustCourse = COURSES.find((course) => course.variant === "robust");
    assert.equal(isCourseAheadOfStage(robustCourse, assignments, "ST1"), false);
  });

  it("does not treat the generic ROBUST curriculum label as explicit ROBUST evidence", () => {
    const assignments = assignCourseEntries(COURSES, [
      {
        _scanFilter: "courses",
        name: "Obstetric simulation course (ROBUST or equivalent)",
        year: "ST1",
        extractedFields: { "evidence type": "Courses" },
      },
    ], {
      currentStage: "ST1",
    });
    const robustCourse = COURSES.find((course) => course.variant === "robust");
    assert.equal(isCourseAheadOfStage(robustCourse, assignments, "ST1"), false);
  });

  it("assigns SITM to the matching training-year slot", () => {
    const assignments = assignCourseEntries(COURSES, [
      {
        _scanFilter: "courses",
        name: "SITM course",
        year: "ST5",
        extractedFields: { "evidence type": "Courses" },
      },
    ], { currentStage: "ST5" });
    const sitmSt5 = COURSES.find(
      (course) => course.family === "sitm" && course.required_by_stage === "ST5",
    );
    const sitmSt6 = COURSES.find(
      (course) => course.family === "sitm" && course.required_by_stage === "ST6",
    );

    assert.equal(isCourseRequirementMet(sitmSt5, assignments), true);
    assert.equal(isCourseRequirementMet(sitmSt6, assignments), false);
  });

  it("infers ST1 from grade-scoped course scans when training year is missing", () => {
    const listOnlyEntries = ST1_COURSE_ENTRIES.map(({ year, ...entry }) => entry);
    const assignments = assignCourseEntries(COURSES, listOnlyEntries, {
      currentStage: "ST1",
    });
    const robust = COURSES.find((course) => course.variant === "robust");
    assert.equal(isCourseAheadOfStage(robust, assignments, "ST1"), false);
    assert.equal(
      isCourseRequirementMet(
        COURSES.find((course) => course.variant === "prompt"),
        assignments,
      ),
      true,
    );
  });

  it("dedupes duplicate representations of the same course log by source entry id", () => {
    const dedupedEntries = collectCourseEvidenceEntries({
      entries: [
        {
          detected_entry_type: "other_evidence",
          sourceEntryId: "979919",
          sourceUrl: "https://training.rcog.org.uk/log-entry/979919?destination=/search",
          name: "Obstetric simulation course (ROBUST or equivalent)",
          extractedFields: { "evidence type": "Courses" },
        },
      ],
      all_entries: [
        {
          _scanFilter: "courses",
          sourceEntryId: "979919",
          url: "https://training.rcog.org.uk/log-entry/979919",
          name: "PROMPT",
          year: "ST1",
          extractedFields: { "evidence type": "Courses" },
        },
      ],
    });

    assert.equal(dedupedEntries.length, 1);
    assert.equal(dedupedEntries[0].name, "PROMPT");

    const assignments = assignCourseEntries(COURSES, dedupedEntries, {
      currentStage: "ST1",
    });
    const promptCourse = COURSES.find((course) => course.variant === "prompt");
    const robustCourse = COURSES.find((course) => course.variant === "robust");

    assert.equal(isCourseRequirementMet(promptCourse, assignments), true);
    assert.equal(isCourseAheadOfStage(robustCourse, assignments, "ST1"), false);
  });
});

describe("courseMatchedByEntries", () => {
  const promptCourseEntry = {
    _scanFilter: "courses",
    name: "Obstetric simulation course (e.g. PROMPT/ALSO/other)",
    extractedFields: { "evidence type": "Courses" },
  };

  it("matches the ST1 PROMPT/ALSO course by full title", () => {
    assert.equal(
      courseMatchedByEntries(
        "Obstetric simulation course (e.g. PROMPT/ALSO/other)",
        [promptCourseEntry],
      ),
      true,
    );
  });

  it("matches Kaizen entries titled PROMPT without the full simulation course name", () => {
    assert.equal(
      courseMatchedByEntries("Obstetric simulation course (e.g. PROMPT/ALSO/other)", [
        ST1_COURSE_ENTRIES[2],
      ]),
      true,
    );
  });

  it("does not match the ST3 ROBUST course from a PROMPT/ALSO entry", () => {
    assert.equal(
      courseMatchedByEntries(
        "Obstetric simulation course (ROBUST or equivalent)",
        [promptCourseEntry],
      ),
      false,
    );
  });

  it("does not match ROBUST when only the description mentions it", () => {
    assert.equal(
      courseMatchedByEntries("Obstetric simulation course (ROBUST or equivalent)", [
        {
          _scanFilter: "courses",
          name: "Obstetric simulation course (e.g. PROMPT/ALSO/other)",
          extractedFields: {
            "evidence type": "Courses",
            description:
              "Completed PROMPT training. ROBUST course is due later in ST3.",
          },
        },
      ]),
      false,
    );
  });

  it("does not match ROBUST from the word robust in another course description", () => {
    assert.equal(
      courseMatchedByEntries("Obstetric simulation course (ROBUST or equivalent)", [
        {
          _scanFilter: "courses",
          name: "CTG training",
          extractedFields: {
            "evidence type": "Courses",
            description: "Completed CTG training with robust interpretation skills.",
          },
        },
      ]),
      false,
    );
  });

  it("requires leadership and management for leadership course rows", () => {
    assert.equal(
      courseMatchedByEntries("Leadership and management course", [
        {
          _scanFilter: "courses",
          name: "Leadership conference",
          extractedFields: { "evidence type": "Courses" },
        },
      ]),
      false,
    );
  });
});

describe("courseMatchedForAheadOfStage", () => {
  const promptOnlyEntry = ST1_COURSE_ENTRIES[2];

  it("does not treat a PROMPT log as early ROBUST completion", () => {
    assert.equal(
      courseMatchedForAheadOfStage(
        "Obstetric simulation course (ROBUST or equivalent)",
        [promptOnlyEntry],
      ),
      false,
    );
  });

  it("still counts an explicitly titled ROBUST course", () => {
    assert.equal(
      courseMatchedForAheadOfStage("Obstetric simulation course (ROBUST or equivalent)", [
        {
          _scanFilter: "courses",
          name: "ROBUST obstetric simulation course",
          year: "ST2",
          extractedFields: { "evidence type": "Courses" },
        },
      ]),
      true,
    );
  });
});

describe("buildAheadOfStageItems courses", () => {
  it("does not list future courses from loose leadership or ROBUST false positives", () => {
    const courseAssignments = assignCourseEntries(COURSES, ST1_COURSE_ENTRIES, {
      currentStage: "ST1",
    });
    const items = buildAheadOfStageItems("ST1", {
      entries: [],
      entryTitlesLower: new Set(),
      evidenceTypesLower: new Set(),
      courseEntries: ST1_COURSE_ENTRIES,
      courseAssignments,
      completedExamTypes: new Set(),
      proRata: { onTrack: true, deltaToExpected: 4 },
      keySkillsContext: { uses_stage_pace: true },
      cipAssessments: [],
    });

    assert.equal(
      items.some((item) => item.name.includes("ROBUST")),
      false,
    );
    assert.equal(
      items.some((item) => item.name.includes("Leadership")),
      false,
    );
  });
});

describe("resolveCoursesFilterUrl", () => {
  it("stacks grade, other evidence, and course type facets", () => {
    const gradeFacet = findGradeFacet(USER_CATALOG, "ST1");
    const resolved = resolveCoursesFilterUrl(
      "https://training.rcog.org.uk/search",
      USER_CATALOG,
      gradeFacet,
    );
    const url = new URL(resolved.url);
    assert.equal(url.searchParams.get("f[0]"), "aggregated_field_grade:71");
    assert.equal(url.searchParams.get("f[1]"), "log_entry:logentry_other_evidence");
    assert.equal(url.searchParams.get("f[2]"), "field_logentry_evidence_type:1044");
  });
});

function findGradeFacet(catalog, grade) {
  return catalog.filters.find((filter) => filter.label.trim() === grade) ?? null;
}
