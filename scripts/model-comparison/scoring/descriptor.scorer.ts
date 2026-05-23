import {
  binaryCheck,
  proportionalCheck,
  sumScore,
  sumMax,
} from "./shared";
import type { CheckResult, DescriptorTestCase } from "../types";

export interface DescriptorScoreResult {
  checks: CheckResult[];
  score: number;
  maxScore: number;
}

export function scoreDescriptor(
  testCase: DescriptorTestCase,
  parsed: unknown,
  parseSuccess: boolean,
  referenceOutput: unknown, // Haiku's output for agreement scoring
): DescriptorScoreResult {
  const checks: CheckResult[] = [];
  const expectedIds = new Set(testCase.descriptors.map((d) => d.descriptor_id));

  // ── 1. Format integrity (30 pts) ─────────────────────────────────────────

  checks.push(binaryCheck("valid_json_array", parseSuccess && Array.isArray(parsed), 15));

  if (!parseSuccess || !Array.isArray(parsed)) {
    checks.push(proportionalCheck("all_descriptor_ids_present", 0, 10, "skipped"));
    checks.push(binaryCheck("no_unexpected_items", false, 5, "skipped"));
    checks.push(proportionalCheck("covered_is_boolean", 0, 15, "skipped"));
    checks.push(proportionalCheck("confidence_is_0_to_1", 0, 15, "skipped"));
    checks.push(proportionalCheck("no_missing_fields", 0, 10, "skipped"));
    checks.push(proportionalCheck("agreement_with_reference", 0, 30, "skipped"));
    return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
  }

  const items = parsed as Record<string, unknown>[];
  const returnedIds = new Set(items.map((i) => String(i.descriptor_id ?? "")));

  // All expected descriptor_ids present
  const missingIds = [...expectedIds].filter((id) => !returnedIds.has(id));
  const presentPts = expectedIds.size > 0
    ? Math.round(((expectedIds.size - missingIds.length) / expectedIds.size) * 10)
    : 10;
  checks.push(
    proportionalCheck(
      "all_descriptor_ids_present",
      presentPts,
      10,
      missingIds.length > 0 ? `Missing ${missingIds.length} IDs` : undefined,
    ),
  );

  // No unexpected items (returned IDs should all be in expectedIds)
  const unexpectedIds = [...returnedIds].filter((id) => !expectedIds.has(id));
  checks.push(
    binaryCheck(
      "no_unexpected_items",
      unexpectedIds.length === 0,
      5,
      unexpectedIds.length > 0 ? `${unexpectedIds.length} unexpected IDs` : undefined,
    ),
  );

  // ── 2. Data validity per item (40 pts) ───────────────────────────────────

  const validItems = items.filter((i) => expectedIds.has(String(i.descriptor_id ?? "")));

  const coveredBooleans = validItems.filter((i) => typeof i.covered === "boolean");
  const coveredPts = validItems.length > 0
    ? Math.round((coveredBooleans.length / validItems.length) * 15)
    : 15;
  checks.push(
    proportionalCheck(
      "covered_is_boolean",
      coveredPts,
      15,
      `${coveredBooleans.length}/${validItems.length} items have boolean covered`,
    ),
  );

  const validConf = validItems.filter((i) => {
    const c = Number(i.confidence ?? -1);
    return Number.isFinite(c) && c >= 0 && c <= 1;
  });
  const confPts = validItems.length > 0
    ? Math.round((validConf.length / validItems.length) * 15)
    : 15;
  checks.push(
    proportionalCheck(
      "confidence_is_0_to_1",
      confPts,
      15,
      `${validConf.length}/${validItems.length} valid confidence values`,
    ),
  );

  // No missing required fields (descriptor_id, covered, confidence)
  const itemsWithAllFields = validItems.filter(
    (i) =>
      "descriptor_id" in i &&
      "covered" in i &&
      "confidence" in i,
  );
  const fieldPts = validItems.length > 0
    ? Math.round((itemsWithAllFields.length / validItems.length) * 10)
    : 10;
  checks.push(proportionalCheck("no_missing_fields", fieldPts, 10));

  // ── 3. Agreement with judge (30 pts) ─────────────────────────────────────

  if (referenceOutput && Array.isArray(referenceOutput) && referenceOutput.length > 0) {
    const refMap = new Map<string, boolean>();
    for (const item of referenceOutput as Record<string, unknown>[]) {
      const id = String(item.descriptor_id ?? "");
      if (id && typeof item.covered === "boolean") {
        refMap.set(id, item.covered as boolean);
      }
    }

    const currentMap = new Map<string, boolean>();
    for (const item of validItems) {
      const id = String(item.descriptor_id ?? "");
      if (id && typeof item.covered === "boolean") {
        currentMap.set(id, item.covered as boolean);
      }
    }

    const sharedIds = [...refMap.keys()].filter((id) => currentMap.has(id));
    if (sharedIds.length > 0) {
      const agreements = sharedIds.filter(
        (id) => currentMap.get(id) === refMap.get(id),
      );
      const agreementRate = agreements.length / sharedIds.length;
      const agreementPts = Math.round(agreementRate * 30);
      checks.push(
        proportionalCheck(
          "agreement_with_judge",
          agreementPts,
          30,
          `${agreements.length}/${sharedIds.length} agree with Sonnet judge (${Math.round(agreementRate * 100)}%)`,
        ),
      );
    } else {
      checks.push(
        proportionalCheck("agreement_with_judge", 0, 30, "no shared IDs to compare"),
      );
    }
  } else {
    // No judge verdict available — skip check (give full points so it doesn't penalise)
    checks.push(
      proportionalCheck("agreement_with_judge", 30, 30, "no judge verdict — skipped"),
    );
  }

  return { checks, score: sumScore(checks), maxScore: sumMax(checks) };
}
