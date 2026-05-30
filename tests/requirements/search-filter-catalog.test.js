import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findBestCatalogMatch,
  resolveCatalogUrlsForPass,
} from "../../../portfolioiq-extension/readiness/search-filter-catalog.js";

describe("search filter catalog matching", () => {
  const catalog = {
    filters: [
      {
        group: "Assessment",
        label: "Team Observation Form 2 (TO2)",
        url: "https://training.rcog.org.uk/search?f%5B0%5D=assessment_type%3Aassesstype_to2",
      },
      {
        group: "Other evidence",
        label: "Basic practical skills in obstetrics and gynaecology",
        url: "https://training.rcog.org.uk/search?f=bps",
      },
      {
        group: "Assessment",
        label: "OSATS (summative)",
        url: "https://training.rcog.org.uk/search?f=osats",
      },
    ],
  };

  it("matches curriculum course names to exact catalog labels", () => {
    const hit = findBestCatalogMatch(
      catalog.filters,
      "Basic practical skills in obstetrics and gynaecology",
      [],
    );
    assert.equal(hit?.url, "https://training.rcog.org.uk/search?f=bps");
  });

  it("resolves pass URLs from catalog before fallbacks", () => {
    const resolution = resolveCatalogUrlsForPass(catalog, {
      id: "courses",
      curriculumNames: ["Basic practical skills in obstetrics and gynaecology"],
      filterPatterns: ["basic practical"],
      fallbackUrls: ["https://training.rcog.org.uk/search?keys=fallback"],
    });

    assert.equal(resolution.usedCatalog, true);
    assert.equal(resolution.usedFallback, false);
    assert.deepEqual(resolution.urls, [
      "https://training.rcog.org.uk/search?f=bps&items_per_page=100",
    ]);
    assert.equal(resolution.matched.length, 1);
  });

  it("falls back when catalog has no matches", () => {
    const resolution = resolveCatalogUrlsForPass(
      { filters: [] },
      {
        id: "courses",
        curriculumNames: ["Unknown course"],
        filterPatterns: [],
        fallbackUrls: ["https://training.rcog.org.uk/search?keys=fallback"],
      },
    );

    assert.equal(resolution.usedCatalog, false);
    assert.equal(resolution.usedFallback, true);
    assert.deepEqual(resolution.urls, [
      "https://training.rcog.org.uk/search?keys=fallback&items_per_page=100",
    ]);
  });

  it("stacks grade facet on year-scoped TO2 passes", () => {
    const gradeFacet = {
      label: "ST1",
      url: "https://training.rcog.org.uk/search?f%5B0%5D=aggregated_field_grade%3A71",
    };
    const resolution = resolveCatalogUrlsForPass(
      catalog,
      {
        id: "team_observations",
        filterPatterns: ["team observation form 2"],
        stackGrade: true,
        primaryFacet: "assessment_type:assesstype_to2",
      },
      { gradeFacet },
    );

    assert.equal(resolution.stackedGrade, true);
    assert.equal(resolution.gradeFacet, "ST1");
    const parsed = new URL(resolution.urls[0]);
    assert.equal(parsed.searchParams.get("f[0]"), "aggregated_field_grade:71");
    assert.equal(parsed.searchParams.get("f[1]"), "assessment_type:assesstype_to2");
  });
});
