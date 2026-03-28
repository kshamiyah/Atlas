import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeProgressCipRows } from "../../lib/progress/cip-metrics";
import { computeDescriptorGroups } from "../../lib/progress/descriptor-metrics";
import { computeKeySkillGroups, filterAndSortKeySkillGroups } from "../../lib/progress/key-skill-metrics";
import { computeProgressKpis } from "../../lib/progress/summary-metrics";

/**
 * Synthetic curriculum + scoped rows. No database — proves summary KPIs match
 * unfiltered aggregations from the same inputs used by CiP / key-skills / descriptors stacks.
 */
function buildFixture() {
  const cips = [
    { id: "c1", number: 1, title: "CiP 1" },
    { id: "c2", number: 2, title: "CiP 2" },
  ];
  const keySkills = [
    { id: "ks1", cip_id: "c1", skill_number: 1, title: "Skill 1" },
    { id: "ks2", cip_id: "c1", skill_number: 2, title: "Skill 2" },
    { id: "ks3", cip_id: "c2", skill_number: 1, title: "Skill 3" },
  ];
  const descriptors = [
    { id: "d1", key_skill_id: "ks1", text: "D1", sort_order: 1 },
    { id: "d2", key_skill_id: "ks1", text: "D2", sort_order: 2 },
    { id: "d3", key_skill_id: "ks2", text: "D3", sort_order: 1 },
    { id: "d4", key_skill_id: "ks3", text: "D4", sort_order: 1 },
  ];

  const scopedEntries = [
    {
      id: "e1",
      title: "Entry",
      stage_id: "st-a",
      linked_cip_number: 1,
      event_date: "2026-02-01",
      created_at: "2026-02-01T12:00:00Z",
    },
  ];
  const scopedEntryIds = new Set(scopedEntries.map((e) => e.id));

  const confirmedRows = [
    { key_skill_id: "ks1", review_entry_id: "e1" },
    { key_skill_id: "ks2", review_entry_id: "e1" },
    { key_skill_id: "ks3", review_entry_id: "e1" },
  ];

  const coverageRows = [
    {
      key_skill_id: "ks1",
      descriptor_id: "d1",
      covered: true,
      review_entry_id: "e1",
    },
    {
      key_skill_id: "ks3",
      descriptor_id: "d4",
      covered: true,
      review_entry_id: "e1",
    },
  ];

  return {
    cips,
    keySkills,
    descriptors,
    scopedEntries,
    scopedEntryIds,
    confirmedRows,
    coverageRows,
  };
}

describe("Progress KPI reconciliation (summary vs detail stacks)", () => {
  it("summary.cips matches CiP row aggregation", () => {
    const f = buildFixture();
    const { kpis } = computeProgressKpis({
      scopedEntryIds: f.scopedEntryIds,
      cips: f.cips,
      keySkills: f.keySkills,
      descriptors: f.descriptors,
      confirmedRows: f.confirmedRows,
      coverageRows: f.coverageRows,
    });

    const cipRows = computeProgressCipRows({
      cips: f.cips,
      keySkills: f.keySkills,
      descriptors: f.descriptors,
      scopedEntryIds: f.scopedEntryIds,
      scopedEntries: f.scopedEntries,
      confirmedRows: f.confirmedRows,
      coverageRows: f.coverageRows,
    });

    let coveredFromRows = 0;
    for (const r of cipRows) {
      if (r.key_skills.total > 0 && r.key_skills.covered === r.key_skills.total) {
        coveredFromRows += 1;
      }
    }
    assert.equal(coveredFromRows, kpis.cips.covered);
    assert.equal(cipRows.length, kpis.cips.total);
  });

  it("summary.key_skills matches unfiltered key-skill groups", () => {
    const f = buildFixture();
    const { kpis } = computeProgressKpis({
      scopedEntryIds: f.scopedEntryIds,
      cips: f.cips,
      keySkills: f.keySkills,
      descriptors: f.descriptors,
      confirmedRows: f.confirmedRows,
      coverageRows: f.coverageRows,
    });

    const built = computeKeySkillGroups({
      cips: f.cips,
      keySkills: f.keySkills,
      descriptors: f.descriptors,
      scopedEntryIds: f.scopedEntryIds,
      scopedEntries: f.scopedEntries,
      confirmedRows: f.confirmedRows,
      coverageRows: f.coverageRows,
    });
    const flat = filterAndSortKeySkillGroups(built, {
      gapsOnly: false,
      confirmedOnly: false,
      sort: "skill_number",
    });
    const skills = flat.flatMap((g) => g.key_skills);
    const confirmed = skills.filter((s) => s.is_confirmed).length;

    assert.equal(confirmed, kpis.key_skills.covered);
    assert.equal(skills.length, kpis.key_skills.total);
  });

  it("summary.descriptors matches unfiltered descriptor groups", () => {
    const f = buildFixture();
    const { kpis } = computeProgressKpis({
      scopedEntryIds: f.scopedEntryIds,
      cips: f.cips,
      keySkills: f.keySkills,
      descriptors: f.descriptors,
      confirmedRows: f.confirmedRows,
      coverageRows: f.coverageRows,
    });

    const groups = computeDescriptorGroups({
      cips: f.cips,
      keySkills: f.keySkills,
      descriptors: f.descriptors,
      scopedEntryIds: f.scopedEntryIds,
      scopedEntries: f.scopedEntries,
      coverageRows: f.coverageRows.map((r) => ({
        key_skill_id: r.key_skill_id,
        descriptor_id: r.descriptor_id,
        covered: r.covered,
        review_entry_id: r.review_entry_id,
        confidence: null,
        evidence_quote: null,
      })),
    });

    let total = 0;
    let covered = 0;
    for (const g of groups) {
      for (const sk of g.skills) {
        total += sk.descriptors.length;
        covered += sk.descriptors.filter((d) => d.covered).length;
      }
    }

    assert.equal(total, kpis.descriptors.total);
    assert.equal(covered, kpis.descriptors.covered);
  });
});
