import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { indexBestCipAssessmentsByNumber } from "../../../portfolioiq-extension/readiness/cip-supervision.js";
import {
  buildFacetSearchUrl,
  extractFacetParamsFromUrl,
  findGradeFacetInCatalog,
  resolveSmartScanFilterUrl,
} from "../../../portfolioiq-extension/readiness/search-filter-catalog.js";
import {
  buildSmartScanPlan,
  resolveCoursesFilterUrl,
} from "../../../portfolioiq-extension/readiness/smart-search-scrape.js";

const USER_CATALOG = {
  filters: [
    {
      label: "ST1 ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=aggregated_field_grade%3A71",
    },
    {
      label: "ST4 ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=aggregated_field_grade%3A74",
    },
    {
      label: "CiP assessment ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=assessment_type%3Acip_assessment",
    },
    {
      label: "OSATS (summative) ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=assessment_type%3Aassesstype_osats_summative",
    },
    {
      label: "Other evidence ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=log_entry%3Alogentry_other_evidence",
    },
    {
      label: "Courses ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=field_logentry_evidence_type%3A1044",
    },
    {
      label: "Self Observation Form (Self TO1) ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=assessment_type%3Aassesstype_self_to1",
    },
    {
      label: "Team Observation Form 2 (TO2) ",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=assessment_type%3Aassesstype_to2",
    },
  ],
};

describe("facet URL helpers", () => {
  it("extracts facet params from Kaizen search URLs", () => {
    assert.deepEqual(
      extractFacetParamsFromUrl(
        "https://training.rcog.org.uk/search?f%5B0%5D=aggregated_field_grade%3A71",
      ),
      ["aggregated_field_grade:71"],
    );
  });

  it("builds stacked facet URLs with items_per_page", () => {
    const url = buildFacetSearchUrl("https://training.rcog.org.uk/search", [
      "aggregated_field_grade:71",
      "assessment_type:cip_assessment",
    ]);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("f[0]"), "aggregated_field_grade:71");
    assert.equal(parsed.searchParams.get("f[1]"), "assessment_type:cip_assessment");
    assert.equal(parsed.searchParams.get("items_per_page"), "100");
  });

  it("finds the grade facet for the current training year", () => {
    const st4 = findGradeFacetInCatalog(USER_CATALOG, "ST4");
    assert.equal(st4?.label.trim(), "ST4");
    assert.deepEqual(extractFacetParamsFromUrl(st4?.url), ["aggregated_field_grade:74"]);
  });
});

describe("smart scan plan", () => {
  it("stacks grade facet only on year-scoped filters", () => {
    const plan = buildSmartScanPlan(USER_CATALOG, "ST1");
    const byId = Object.fromEntries(plan.filters.map((filter) => [filter.id, filter]));

    assert.equal(byId.cip_assessments.stackGrade, true);
    assert.equal(byId.courses.stackGrade, true);
    assert.equal(byId.osats_summative.stackGrade, false);
    assert.equal(byId.to2.stackGrade, true);

    const cipUrl = new URL(byId.cip_assessments.url);
    assert.equal(cipUrl.searchParams.get("f[0]"), "aggregated_field_grade:71");
    assert.equal(cipUrl.searchParams.get("f[1]"), "assessment_type:cip_assessment");

    const osatsUrl = new URL(byId.osats_summative.url);
    assert.equal(osatsUrl.searchParams.get("f[0]"), "assessment_type:assesstype_osats_summative");
    assert.equal(osatsUrl.searchParams.get("f[1]"), null);

    const to2Url = new URL(byId.to2.url);
    assert.equal(to2Url.searchParams.get("f[0]"), "aggregated_field_grade:71");
    assert.equal(to2Url.searchParams.get("f[1]"), "assessment_type:assesstype_to2");

    const coursesUrl = new URL(byId.courses.url);
    assert.equal(coursesUrl.searchParams.get("f[0]"), "aggregated_field_grade:71");
    assert.equal(coursesUrl.searchParams.get("f[1]"), "log_entry:logentry_other_evidence");
    assert.equal(coursesUrl.searchParams.get("f[2]"), "field_logentry_evidence_type:1044");
  });

  it("resolves smart scan filter URLs from catalog labels", () => {
    const resolved = resolveSmartScanFilterUrl(
      "https://training.rcog.org.uk/search",
      USER_CATALOG,
      {
        id: "to2",
        stackGrade: true,
        patterns: ["team observation form 2"],
        fallbackFacet: "assessment_type:assesstype_to2",
      },
      findGradeFacetInCatalog(USER_CATALOG, "ST4"),
    );

    assert.equal(resolved.usedCatalog, true);
    assert.equal(resolved.facetValues[0], "aggregated_field_grade:74");
    assert.equal(resolved.facetValues[1], "assessment_type:assesstype_to2");
  });
});

describe("indexBestCipAssessmentsByNumber training year", () => {
  it("prefers assessments from the current training year", () => {
    const indexed = indexBestCipAssessmentsByNumber(
      [
        {
          cip_number: 7,
          training_year: "ST1",
          status: "complete",
          es_entrustment: 2,
          es_meets_expectations: true,
        },
        {
          cip_number: 7,
          training_year: "ST4",
          status: "pending",
        },
      ],
      { trainingYear: "ST4" },
    );

    assert.equal(indexed.get(7)?.training_year, "ST4");
  });

  it("does not fall back to a prior training year when the current year has no match", () => {
    const indexed = indexBestCipAssessmentsByNumber(
      [
        {
          cip_number: 11,
          training_year: "ST1",
          status: "complete",
          es_entrustment: 2,
          es_meets_expectations: true,
        },
      ],
      { trainingYear: "ST2" },
    );

    assert.equal(indexed.has(11), false);
  });

  it("keeps all years when no training year is provided", () => {
    const indexed = indexBestCipAssessmentsByNumber([
      { cip_number: 3, training_year: "ST1", es_meets_expectations: true },
      { cip_number: 3, training_year: "ST2", es_meets_expectations: true, es_entrustment: 2 },
    ]);

    assert.equal(indexed.size, 1);
  });
});
