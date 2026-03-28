import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDescriptorsListParams,
  parseKeySkillsListParams,
  parseProgressScopeFromUrl,
} from "../../lib/progress/query-params";

describe("parseProgressScopeFromUrl", () => {
  it("rejects invalid stage_scope", () => {
    const r = parseProgressScopeFromUrl(new URL("http://x?t=1&stage_scope=BAD"));
    assert.ok("error" in r);
    assert.match(String((r as { error: string }).error), /stage_scope/i);
  });

  it("rejects date_from after date_to", () => {
    const r = parseProgressScopeFromUrl(
      new URL("http://x?date_from=2026-02-10&date_to=2026-01-01"),
    );
    assert.ok("error" in r);
    assert.match(String((r as { error: string }).error), /date/i);
  });

  it("rejects invalid cip", () => {
    const r = parseProgressScopeFromUrl(new URL("http://x?cip=99"));
    assert.ok("error" in r);
  });

  it("accepts empty scope", () => {
    const r = parseProgressScopeFromUrl(new URL("http://x"));
    assert.ok(!("error" in r));
  });
});

describe("parseKeySkillsListParams", () => {
  it("rejects gaps_only and confirmed_only together", () => {
    const r = parseKeySkillsListParams(new URL("http://x?gaps_only=1&confirmed_only=true"));
    assert.ok("error" in r);
  });

  it("rejects invalid sort", () => {
    const r = parseKeySkillsListParams(new URL("http://x?sort=nope"));
    assert.ok("error" in r);
  });
});

describe("parseDescriptorsListParams", () => {
  it("rejects both descriptor gap flags", () => {
    const r = parseDescriptorsListParams(
      new URL("http://x?descriptor_gaps_only=1&descriptor_covered_only=yes"),
    );
    assert.ok("error" in r);
  });

  it("rejects invalid descriptor_sort", () => {
    const r = parseDescriptorsListParams(new URL("http://x?descriptor_sort=fast"));
    assert.ok("error" in r);
  });
});
