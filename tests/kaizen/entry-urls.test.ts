import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKaizenFillTargetUrl,
  buildKaizenNewEntryUrl,
  KAIZEN_NEW_ENTRY_PATHS,
} from "../../lib/kaizen/entry-urls";

describe("Kaizen new entry URLs", () => {
  it("uses live log-entry bundle slugs", () => {
    assert.equal(
      KAIZEN_NEW_ENTRY_PATHS.reflection,
      "/log-entry/add/logentry_reflective_logentry",
    );
    assert.equal(
      buildKaizenNewEntryUrl("reflection"),
      "https://training.rcog.org.uk/log-entry/add/logentry_reflective_logentry",
    );
  });

  it("uses live assesstype_* assessment bundle slugs", () => {
    assert.equal(
      KAIZEN_NEW_ENTRY_PATHS.minicex,
      "/assessment-type/add/assesstype_mini_cex",
    );
    assert.equal(
      buildKaizenFillTargetUrl("notss"),
      "https://training.rcog.org.uk/assessment-type/add/assesstype_notss",
    );
    assert.equal(
      buildKaizenNewEntryUrl("osats_summative"),
      "https://training.rcog.org.uk/assessment-type/add/assesstype_osats_summative",
    );
  });
});
