import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findEntryForProgressFocus,
  parseProgressFocusFromSearchParams,
} from "../../lib/key-skill-review/progress-focus";
import type { ReviewEntry } from "../../lib/types/key-skill-review";

const skillA = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const skillB = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const desc1 = "cccccccc-dddd-4eee-8fff-000000000001";

describe("parseProgressFocusFromSearchParams", () => {
  it("returns null when no focus params", () => {
    assert.equal(parseProgressFocusFromSearchParams(new URLSearchParams("")), null);
  });

  it("parses cip only", () => {
    const p = parseProgressFocusFromSearchParams(new URLSearchParams("focus_cip=3"));
    assert.deepEqual(p, { cip: 3, skillId: null, descriptorId: null });
  });

  it("parses skill and descriptor", () => {
    const p = parseProgressFocusFromSearchParams(
      new URLSearchParams(`focus_skill=${skillA}&focus_descriptor=${desc1}`),
    );
    assert.deepEqual(p, { cip: null, skillId: skillA, descriptorId: desc1 });
  });

  it("drops descriptor without skill", () => {
    const p = parseProgressFocusFromSearchParams(new URLSearchParams(`focus_descriptor=${desc1}`));
    assert.equal(p, null);
  });
});

describe("findEntryForProgressFocus", () => {
  const entry1: ReviewEntry = {
    id: "e1",
    title: "T1",
    entry_type: "log",
    linked_cip_number: 3,
    date: "2026-01-01",
    raw_text: "x",
    linked_cip_suggestions: [
      {
        suggestion_id: "s1",
        key_skill_id: skillA,
        cip_number: 3,
        key_skill_title: "Skill A",
        confidence: 0.9,
        rationale: "",
        status: "suggested",
        source: "linked_cip",
      },
    ],
    cross_cip_suggestions: [],
    descriptor_coverage: [
      {
        key_skill_id: skillA,
        key_skill_title: "Skill A",
        cip_number: 3,
        descriptors: [
          {
            descriptor_id: desc1,
            descriptor_text: "D1",
            sort_order: 1,
            covered: true,
            confidence: 0.8,
            evidence_quote: "q",
          },
        ],
      },
    ],
  };

  const entry2: ReviewEntry = {
    id: "e2",
    title: "T2",
    entry_type: "log",
    linked_cip_number: 5,
    date: "2026-01-02",
    raw_text: "y",
    linked_cip_suggestions: [],
    cross_cip_suggestions: [
      {
        suggestion_id: "s2",
        key_skill_id: skillB,
        cip_number: 7,
        key_skill_title: "Skill B",
        confidence: 0.5,
        rationale: "",
        status: "suggested",
        source: "cross_cip",
      },
    ],
  };

  it("matches descriptor + skill", () => {
    const r = findEntryForProgressFocus([entry1, entry2], {
      cip: 3,
      skillId: skillA,
      descriptorId: desc1,
    });
    assert.equal(r.entryId, "e1");
    assert.equal(r.matchQuality, "matched");
  });

  it("matches skill on cross-cip", () => {
    const r = findEntryForProgressFocus([entry1, entry2], {
      cip: 7,
      skillId: skillB,
      descriptorId: null,
    });
    assert.equal(r.entryId, "e2");
    assert.equal(r.matchQuality, "matched");
  });

  it("falls back to linked cip number", () => {
    const r = findEntryForProgressFocus([entry1, entry2], {
      cip: 3,
      skillId: null,
      descriptorId: null,
    });
    assert.equal(r.entryId, "e1");
    assert.equal(r.matchQuality, "matched");
  });

  it("returns none when no match", () => {
    const r = findEntryForProgressFocus([entry2], {
      cip: 3,
      skillId: skillA,
      descriptorId: null,
    });
    assert.equal(r.entryId, null);
    assert.equal(r.matchQuality, "none");
  });
});
