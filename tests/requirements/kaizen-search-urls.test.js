import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  kaizenSearchBaseUrl,
  withItemsPerPage,
} from "../../../portfolioiq-extension/readiness/team-observation-sources.js";

describe("kaizen search urls", () => {
  it("adds items_per_page to plain search urls", () => {
    assert.equal(
      kaizenSearchBaseUrl(),
      "https://training.rcog.org.uk/search?items_per_page=100",
    );
  });

  it("preserves existing query params when adding items_per_page", () => {
    assert.equal(
      withItemsPerPage("https://training.rcog.org.uk/search?keys=OSATS"),
      "https://training.rcog.org.uk/search?keys=OSATS&items_per_page=100",
    );
  });
});
