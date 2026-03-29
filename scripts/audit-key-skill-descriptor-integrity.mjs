#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function unescapeSql(value) {
  return String(value ?? "").replace(/''/g, "'");
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function jaccard(a, b) {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function parseCipNumberFromCipId(cipId) {
  const match = String(cipId).match(/000000000(\d{3})$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function parseKeySkillSortOrderFromId(keySkillId) {
  const match = String(keySkillId).match(/0003-\d{3}(\d{3})\d{6}$/);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : 0;
}

function parseKeySkills(seedSql) {
  const rows = [];
  const re =
    /\('(?<id>00000000-0000-0000-0003-[^']+)',\s*'(?<cipId>00000000-0000-0000-0002-[^']+)',\s*(?<sortOrder>\d+),\s*'(?<title>(?:''|[^'])+)',\s*'CiP_[^']+'\)/g;

  for (const match of seedSql.matchAll(re)) {
    const groups = match.groups ?? {};
    const cipNumber = parseCipNumberFromCipId(groups.cipId);
    if (!cipNumber) continue;
    rows.push({
      id: groups.id,
      cip_number: cipNumber,
      sort_order: Number(groups.sortOrder),
      title: unescapeSql(groups.title),
    });
  }

  return rows;
}

function parseDescriptors(seedSql) {
  const rows = [];
  const re =
    /\('(?<id>00000000-0000-0000-0004-[^']+)',\s*'(?<keySkillId>00000000-0000-0000-0003-[^']+)',\s*'(?<text>(?:''|[^'])+)',\s*(?<sortOrder>\d+)\)/g;

  for (const match of seedSql.matchAll(re)) {
    const groups = match.groups ?? {};
    rows.push({
      id: groups.id,
      key_skill_id: groups.keySkillId,
      sort_order: Number(groups.sortOrder),
      text: unescapeSql(groups.text),
    });
  }

  return rows;
}

function parseKaizenUpdates(sqlText) {
  const updates = [];
  const re =
    /UPDATE\s+key_skills\s+SET\s+kaizen_ids\s*=\s*ARRAY\[(?<ids>[^\]]*)\]\s+WHERE\s+title\s*=\s*'(?<title>(?:''|[^'])+)'\s+AND\s+cip_id\s+IN\s+\(SELECT\s+id\s+FROM\s+cips\s+WHERE\s+number\s*=\s*(?<cip>\d+)\);/gms;

  for (const match of sqlText.matchAll(re)) {
    const groups = match.groups ?? {};
    const ids = [];
    for (const idMatch of String(groups.ids ?? "").matchAll(/'(\d+)'/g)) {
      ids.push(idMatch[1]);
    }
    updates.push({
      cip_number: Number(groups.cip),
      title: unescapeSql(groups.title),
      kaizen_ids: ids,
    });
  }

  return updates;
}

function indexBy(array, keyFn) {
  const map = new Map();
  for (const item of array) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function toKey(cipNumber, title) {
  return `${cipNumber}::${title}`;
}

const DESCRIPTOR_ONLY_EXCEPTIONS = new Set([
  toKey(4, "Appreciates the importance of stakeholders in quality improvement work"),
]);

async function main() {
  const args = new Set(process.argv.slice(2));
  const outputJson = args.has("--json");
  const useLive = args.has("--live");
  if (args.has("--help")) {
    console.log(
      [
        "Usage:",
        "  node scripts/audit-key-skill-descriptor-integrity.mjs [--json] [--live]",
        "",
        "Modes:",
        "  default  migration-defined state from seed + mapping SQL files",
        "  --live   reads actual Supabase tables (requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
      ].join("\n"),
    );
    return;
  }

  const root = process.cwd();
  let keySkills = [];
  let descriptors = [];
  let unknownMappingRows = [];
  let kaizenMap = new Map();

  if (useLive) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --live mode.",
      );
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    const [{ data: cips, error: cipsError }, { data: liveKeySkills, error: keySkillsError }, { data: liveDescriptors, error: descriptorsError }] =
      await Promise.all([
        supabase.from("cips").select("id, number"),
        supabase.from("key_skills").select("id, cip_id, title, kaizen_ids"),
        supabase.from("descriptors").select("id, key_skill_id, text"),
      ]);

    if (cipsError) throw new Error(`Failed loading cips: ${cipsError.message}`);
    if (keySkillsError) {
      throw new Error(`Failed loading key_skills: ${keySkillsError.message}`);
    }
    if (descriptorsError) {
      throw new Error(`Failed loading descriptors: ${descriptorsError.message}`);
    }

    const cipNumberById = new Map(
      (cips ?? []).map((row) => [String(row.id), Number(row.number)]),
    );

    keySkills = (liveKeySkills ?? [])
      .map((row) => ({
        id: String(row.id),
        cip_number: cipNumberById.get(String(row.cip_id)) ?? null,
        sort_order: parseKeySkillSortOrderFromId(row.id),
        title: String(row.title ?? ""),
        kaizen_ids: Array.isArray(row.kaizen_ids)
          ? row.kaizen_ids
              .map((value) => String(value ?? "").trim())
              .filter((value) => /^\d+$/.test(value))
          : [],
      }))
      .filter((row) => Number.isInteger(row.cip_number) && row.cip_number > 0);

    descriptors = (liveDescriptors ?? []).map((row) => ({
      id: String(row.id),
      key_skill_id: String(row.key_skill_id),
      sort_order: 0,
      text: String(row.text ?? ""),
    }));
  } else {
    const seedPath = path.join(root, "supabase", "migrations", "0002_seed_curriculum_data.sql");
    const migrationsDir = path.join(root, "supabase", "migrations");

    const seedSql = await fs.readFile(seedPath, "utf8");
    keySkills = parseKeySkills(seedSql).map((row) => ({ ...row, kaizen_ids: [] }));
    descriptors = parseDescriptors(seedSql);

    const migrationFiles = (await fs.readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    kaizenMap = new Map();
    unknownMappingRows = [];
    const keySkillByPair = new Map(
      keySkills.map((skill) => [toKey(skill.cip_number, skill.title), skill]),
    );

    for (const file of migrationFiles) {
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      const updates = parseKaizenUpdates(sql);
      for (const update of updates) {
        const pairKey = toKey(update.cip_number, update.title);
        if (!keySkillByPair.has(pairKey)) {
          unknownMappingRows.push({
            migration: file,
            cip_number: update.cip_number,
            title: update.title,
            kaizen_ids: update.kaizen_ids,
          });
          continue;
        }
        kaizenMap.set(pairKey, update.kaizen_ids);
      }
    }
  }

  const descriptorsByKeySkillId = indexBy(descriptors, (item) => item.key_skill_id);
  const keySkillsByCip = indexBy(keySkills, (item) => item.cip_number);

  const keySkillRows = keySkills.map((skill) => {
    const pairKey = toKey(skill.cip_number, skill.title);
    const kaizenIds =
      Array.isArray(skill.kaizen_ids) && skill.kaizen_ids.length > 0
        ? skill.kaizen_ids
        : kaizenMap.get(pairKey) ?? [];
    const ownDescriptors = descriptorsByKeySkillId.get(skill.id) ?? [];
    const siblingSkills = (keySkillsByCip.get(skill.cip_number) ?? []).filter(
      (candidate) => candidate.id !== skill.id,
    );

    let bestSiblingDescriptor = null;
    for (const sibling of siblingSkills) {
      const siblingDescriptors = descriptorsByKeySkillId.get(sibling.id) ?? [];
      for (const descriptor of siblingDescriptors) {
        const similarity = jaccard(skill.title, descriptor.text);
        if (!bestSiblingDescriptor || similarity > bestSiblingDescriptor.similarity) {
          bestSiblingDescriptor = {
            sibling_key_skill_id: sibling.id,
            sibling_key_skill_title: sibling.title,
            descriptor_id: descriptor.id,
            descriptor_text: descriptor.text,
            similarity,
          };
        }
      }
    }

    let bestOwnDescriptorSimilarity = 0;
    for (const descriptor of ownDescriptors) {
      const similarity = jaccard(skill.title, descriptor.text);
      if (similarity > bestOwnDescriptorSimilarity) {
        bestOwnDescriptorSimilarity = similarity;
      }
    }

    return {
      ...skill,
      descriptor_count: ownDescriptors.length,
      kaizen_ids: kaizenIds,
      mapped: kaizenIds.length > 0,
      best_own_descriptor_similarity: Number(bestOwnDescriptorSimilarity.toFixed(3)),
      best_sibling_descriptor: bestSiblingDescriptor
        ? {
            ...bestSiblingDescriptor,
            similarity: Number(bestSiblingDescriptor.similarity.toFixed(3)),
          }
        : null,
    };
  });

  const unmappedRaw = keySkillRows
    .filter((row) => !row.mapped)
    .sort((a, b) => a.cip_number - b.cip_number || a.sort_order - b.sort_order)
    .map((row) => ({
      cip_number: row.cip_number,
      title: row.title,
      best_sibling_descriptor: row.best_sibling_descriptor,
      expected_descriptor_only: DESCRIPTOR_ONLY_EXCEPTIONS.has(
        toKey(row.cip_number, row.title),
      ),
    }));

  const unmapped = unmappedRaw.filter((row) => !row.expected_descriptor_only);
  const descriptorOnlyExceptions = unmappedRaw.filter((row) => row.expected_descriptor_only);

  const possibleMixups = keySkillRows
    .filter((row) => {
      if (!row.best_sibling_descriptor) return false;
      const siblingSim = row.best_sibling_descriptor.similarity;
      return siblingSim >= 0.55 && siblingSim > row.best_own_descriptor_similarity + 0.05;
    })
    .sort(
      (a, b) =>
        (b.best_sibling_descriptor?.similarity ?? 0) -
        (a.best_sibling_descriptor?.similarity ?? 0),
    )
    .map((row) => ({
      cip_number: row.cip_number,
      key_skill_title: row.title,
      best_own_descriptor_similarity: row.best_own_descriptor_similarity,
      sibling_descriptor_similarity: row.best_sibling_descriptor?.similarity ?? 0,
      sibling_key_skill_title: row.best_sibling_descriptor?.sibling_key_skill_title ?? null,
      sibling_descriptor_text: row.best_sibling_descriptor?.descriptor_text ?? null,
    }));

  const exactTitleDescriptorCrossMatches = [];
  for (const row of keySkillRows) {
    const normalizedTitle = normalizeText(row.title);
    if (!normalizedTitle) continue;
    const siblingSkills = (keySkillsByCip.get(row.cip_number) ?? []).filter(
      (candidate) => candidate.id !== row.id,
    );
    for (const sibling of siblingSkills) {
      const siblingDescriptors = descriptorsByKeySkillId.get(sibling.id) ?? [];
      for (const descriptor of siblingDescriptors) {
        if (normalizeText(descriptor.text) !== normalizedTitle) continue;
        exactTitleDescriptorCrossMatches.push({
          cip_number: row.cip_number,
          key_skill_title: row.title,
          descriptor_owner_title: sibling.title,
          descriptor_text: descriptor.text,
          descriptor_id: descriptor.id,
        });
      }
    }
  }

  const kaizenIdOwners = new Map();
  for (const row of keySkillRows) {
    for (const kaizenId of row.kaizen_ids) {
      if (!kaizenIdOwners.has(kaizenId)) kaizenIdOwners.set(kaizenId, []);
      kaizenIdOwners.get(kaizenId).push({
        cip_number: row.cip_number,
        title: row.title,
      });
    }
  }

  const duplicateKaizenIds = Array.from(kaizenIdOwners.entries())
    .filter(([, owners]) => owners.length > 1)
    .map(([kaizen_id, owners]) => ({ kaizen_id, owners }));

  const summary = {
    source_mode: useLive ? "live_db" : "migrations",
    key_skills_total: keySkillRows.length,
    descriptors_total: descriptors.length,
    mapped_key_skills: keySkillRows.filter((row) => row.mapped).length,
    unmapped_key_skills_raw: unmappedRaw.length,
    unmapped_key_skills_actionable: unmapped.length,
    descriptor_only_exceptions: descriptorOnlyExceptions.length,
    unique_kaizen_ids: kaizenIdOwners.size,
    duplicate_kaizen_ids: duplicateKaizenIds.length,
    possible_mixups: possibleMixups.length,
    exact_cross_matches: exactTitleDescriptorCrossMatches.length,
    unknown_mapping_rows: unknownMappingRows.length,
  };

  const report = {
    generated_at: new Date().toISOString(),
    source_mode: useLive ? "live_db" : "migrations",
    summary,
    unmapped_key_skills: unmapped,
    descriptor_only_exceptions: descriptorOnlyExceptions,
    possible_key_skill_descriptor_mixups: possibleMixups,
    exact_key_skill_title_matches_in_other_descriptors: exactTitleDescriptorCrossMatches,
    duplicate_kaizen_ids: duplicateKaizenIds,
    unknown_mapping_rows: unknownMappingRows,
  };

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nKey Skill / Descriptor Integrity Audit");
  console.log("======================================");
  console.log(`Mode: ${summary.source_mode}`);
  console.log(`Key skills: ${summary.key_skills_total}`);
  console.log(`Descriptors: ${summary.descriptors_total}`);
  console.log(`Mapped key skills: ${summary.mapped_key_skills}`);
  console.log(`Unmapped key skills (raw): ${summary.unmapped_key_skills_raw}`);
  console.log(`Descriptor-only exceptions: ${summary.descriptor_only_exceptions}`);
  console.log(`Unmapped key skills (actionable): ${summary.unmapped_key_skills_actionable}`);
  console.log(`Unique Kaizen IDs: ${summary.unique_kaizen_ids}`);
  console.log(`Duplicate Kaizen IDs: ${summary.duplicate_kaizen_ids}`);
  console.log(`Possible key-skill/descriptor mixups: ${summary.possible_mixups}`);
  console.log(`Exact key-skill title matches in other descriptors: ${summary.exact_cross_matches}`);
  console.log(`Unknown mapping rows in migrations: ${summary.unknown_mapping_rows}`);

  if (descriptorOnlyExceptions.length > 0) {
    console.log("\nDescriptor-only exceptions (not treated as sync gaps):");
    for (const row of descriptorOnlyExceptions) {
      console.log(`- CiP ${row.cip_number}: ${row.title}`);
    }
  }

  if (unmapped.length > 0) {
    console.log("\nUnmapped key skills (actionable):");
    for (const row of unmapped) {
      const sibling = row.best_sibling_descriptor;
      const hint = sibling
        ? ` | closest descriptor (${Math.round(sibling.similarity * 100)}%): ${sibling.descriptor_text}`
        : "";
      console.log(`- CiP ${row.cip_number}: ${row.title}${hint}`);
    }
  }

  if (possibleMixups.length > 0) {
    console.log("\nPossible mixups (review manually):");
    for (const row of possibleMixups.slice(0, 12)) {
      console.log(
        `- CiP ${row.cip_number}: "${row.key_skill_title}" vs sibling descriptor (${Math.round(
          row.sibling_descriptor_similarity * 100,
        )}%) "${row.sibling_descriptor_text}"`,
      );
    }
  }

  if (exactTitleDescriptorCrossMatches.length > 0) {
    console.log("\nExact key-skill title found as descriptor under another key skill:");
    for (const row of exactTitleDescriptorCrossMatches.slice(0, 12)) {
      console.log(
        `- CiP ${row.cip_number}: "${row.key_skill_title}" appears under "${row.descriptor_owner_title}"`,
      );
    }
  }

  if (duplicateKaizenIds.length > 0) {
    console.log("\nDuplicate Kaizen IDs (multiple owners):");
    for (const row of duplicateKaizenIds) {
      const owners = row.owners
        .map((owner) => `CiP ${owner.cip_number}: ${owner.title}`)
        .join(" | ");
      console.log(`- ${row.kaizen_id}: ${owners}`);
    }
  }
}

main().catch((error) => {
  console.error("Audit failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
