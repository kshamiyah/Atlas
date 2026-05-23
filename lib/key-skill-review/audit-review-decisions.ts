export const AUDIT_REVIEW_DECISIONS_KEY = "audit_review_decisions";

export type AuditReviewDecisionChoice = "acted" | "kept" | "dismissed";

export type AuditReviewDecisionRecord = {
  recommendation_key: string;
  decision: AuditReviewDecisionChoice;
  audit_input_fingerprint: string;
  action: "remove" | "replace";
  key_skill_id: string;
  replace_skill_id: string | null;
  key_skill_title?: string | null;
  replace_skill_title?: string | null;
  reviewed_at: string;
};

export function buildAuditRecommendationKey(input: {
  action: "remove" | "replace";
  keySkillId: string;
  replaceSkillId?: string | null;
}): string {
  return input.action === "replace"
    ? `replace:${input.keySkillId}:${input.replaceSkillId ?? ""}`
    : `remove:${input.keySkillId}`;
}

export function parseAuditReviewDecisions(
  metadata: Record<string, unknown> | null | undefined,
): AuditReviewDecisionRecord[] {
  const raw =
    metadata &&
    typeof metadata === "object" &&
    Array.isArray(metadata[AUDIT_REVIEW_DECISIONS_KEY])
      ? metadata[AUDIT_REVIEW_DECISIONS_KEY]
      : [];

  const parsed = raw
    .map<AuditReviewDecisionRecord | null>((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const recommendationKey =
        typeof record.recommendation_key === "string"
          ? record.recommendation_key.trim()
          : "";
      const decision =
        record.decision === "acted" ||
        record.decision === "kept" ||
        record.decision === "dismissed"
          ? record.decision
          : null;
      const auditInputFingerprint =
        typeof record.audit_input_fingerprint === "string"
          ? record.audit_input_fingerprint.trim()
          : "";
      const action =
        record.action === "remove" || record.action === "replace"
          ? record.action
          : null;
      const keySkillId =
        typeof record.key_skill_id === "string" ? record.key_skill_id.trim() : "";
      const reviewedAt =
        typeof record.reviewed_at === "string" ? record.reviewed_at.trim() : "";

      if (!recommendationKey || !decision || !auditInputFingerprint || !action || !keySkillId) {
        return null;
      }

      return {
        recommendation_key: recommendationKey,
        decision,
        audit_input_fingerprint: auditInputFingerprint,
        action,
        key_skill_id: keySkillId,
        replace_skill_id:
          typeof record.replace_skill_id === "string"
            ? record.replace_skill_id.trim()
            : null,
        key_skill_title:
          typeof record.key_skill_title === "string"
            ? record.key_skill_title
            : null,
        replace_skill_title:
          typeof record.replace_skill_title === "string"
            ? record.replace_skill_title
            : null,
        reviewed_at: reviewedAt || new Date(0).toISOString(),
      };
    })
    .filter((item): item is AuditReviewDecisionRecord => Boolean(item))
    .sort(
      (a, b) =>
        new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime(),
    );

  return parsed;
}

export function buildCurrentAuditDecisionMap(
  decisions: AuditReviewDecisionRecord[] | undefined,
  fingerprint: string | null | undefined,
): Record<string, AuditReviewDecisionRecord> {
  if (!Array.isArray(decisions) || !fingerprint) return {};
  const map: Record<string, AuditReviewDecisionRecord> = {};
  for (const decision of decisions) {
    if (decision.audit_input_fingerprint !== fingerprint) continue;
    if (!(decision.recommendation_key in map)) {
      map[decision.recommendation_key] = decision;
    }
  }
  return map;
}

export function findLatestPriorDecision(
  decisions: AuditReviewDecisionRecord[] | undefined,
  recommendationKey: string,
  currentFingerprint: string | null | undefined,
): AuditReviewDecisionRecord | null {
  if (!Array.isArray(decisions)) return null;
  return (
    decisions.find(
      (decision) =>
        decision.recommendation_key === recommendationKey &&
        decision.audit_input_fingerprint !== currentFingerprint,
    ) ?? null
  );
}

export function upsertAuditReviewDecision(
  existing: AuditReviewDecisionRecord[],
  next: AuditReviewDecisionRecord,
): AuditReviewDecisionRecord[] {
  const filtered = existing.filter(
    (item) =>
      !(
        item.recommendation_key === next.recommendation_key &&
        item.audit_input_fingerprint === next.audit_input_fingerprint
      ),
  );
  return [next, ...filtered].slice(0, 200);
}
