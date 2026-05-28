import {
  ENTRY_TYPE_SCHEMAS,
  KAIZEN_FORM_FIELDS,
  type EntryField,
} from "@/lib/constants/entry-schemas";
import { toIsoDateOrNull } from "@/lib/kaizen/kaizen-date";
import type { GeneratedEntryType } from "@/lib/types/entries";

export type KaizenFillKeySkill = {
  key_skill_id: string;
  key_skill_title: string;
  cip_number: number | null;
  kaizen_ids: string[];
  display_value: string;
};

export type KaizenFillPayload = {
  entry_type: GeneratedEntryType;
  fields: Record<string, string>;
  key_skills: KaizenFillKeySkill[];
  stored_at: number;
};

export type KaizenFillFieldPreview = {
  id: string;
  label: string;
  value: string;
  mapped: boolean;
  included: boolean;
};

export type KaizenFillPreview = {
  entryType: GeneratedEntryType;
  entryTitle: string;
  mappableFieldCount: number;
  includedFieldCount: number;
  includedKeySkillCount: number;
  missingRequired: { id: string; label: string }[];
  fields: KaizenFillFieldPreview[];
  keySkills: Array<{ title: string; display_value: string; included: boolean }>;
};

export type KaizenFillKeySkillInput = {
  key_skill_id: string;
  title: string;
  cip_number: number | null;
  kaizen_ids?: string[];
};

function normalizeFieldValue(field: EntryField, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (field.type === "boolean") {
    return trimmed === "true" ? "true" : null;
  }

  if (field.id === "date" || field.type === "date") {
    return toIsoDateOrNull(trimmed) ?? trimmed;
  }

  return trimmed;
}

/** Kaizen autocomplete tokens resolve most reliably as "Title (kaizen_id)". */
export function buildKaizenKeySkillDisplayValue(
  title: string,
  kaizenIds: string[],
): string {
  const kaizenId = kaizenIds.map(String).find(Boolean);
  if (kaizenId) return `${title} (${kaizenId})`;
  return title;
}

export function buildKaizenFillKeySkills(
  skills: KaizenFillKeySkillInput[],
): KaizenFillKeySkill[] {
  return skills.map((skill) => {
    const kaizenIds = (skill.kaizen_ids ?? []).map(String).filter(Boolean);
    return {
      key_skill_id: skill.key_skill_id,
      key_skill_title: skill.title,
      cip_number: skill.cip_number,
      kaizen_ids: kaizenIds,
      display_value: buildKaizenKeySkillDisplayValue(skill.title, kaizenIds),
    };
  });
}

/** Build the payload the Atlas extension expects for auto-fill on Kaizen. */
export function buildKaizenFillPayload(
  entryType: GeneratedEntryType,
  fieldValues: Record<string, string>,
  keySkills: KaizenFillKeySkillInput[] = [],
): KaizenFillPayload {
  const schema = ENTRY_TYPE_SCHEMAS[entryType];
  const kaizenMap = KAIZEN_FORM_FIELDS[entryType] ?? {};
  const fields: Record<string, string> = {};

  for (const field of schema?.fields ?? []) {
    const kaizenId = kaizenMap[field.id];
    if (!kaizenId) continue;

    const normalized = normalizeFieldValue(field, fieldValues[field.id] ?? "");
    if (normalized == null) continue;

    fields[field.id] = normalized;
  }

  return {
    entry_type: entryType,
    fields,
    key_skills: buildKaizenFillKeySkills(keySkills),
    stored_at: Date.now(),
  };
}

/** Preview which fields will be sent to Kaizen before the user clicks Fill. */
export function previewKaizenFill(
  entryType: GeneratedEntryType,
  fieldValues: Record<string, string>,
  keySkills: KaizenFillKeySkillInput[] = [],
): KaizenFillPreview {
  const schema = ENTRY_TYPE_SCHEMAS[entryType];
  const kaizenMap = KAIZEN_FORM_FIELDS[entryType] ?? {};
  const missingRequired: { id: string; label: string }[] = [];
  const fields: KaizenFillFieldPreview[] = [];
  const builtKeySkills = buildKaizenFillKeySkills(keySkills);

  for (const field of schema?.fields ?? []) {
    const mapped = Boolean(kaizenMap[field.id]);
    const normalized = normalizeFieldValue(field, fieldValues[field.id] ?? "");
    const included = mapped && normalized != null;

    if (field.required && mapped && normalized == null) {
      missingRequired.push({ id: field.id, label: field.label });
    }

    fields.push({
      id: field.id,
      label: field.label,
      value: normalized ?? "",
      mapped,
      included,
    });
  }

  return {
    entryType,
    entryTitle: schema?.title ?? entryType,
    mappableFieldCount: Object.keys(kaizenMap).length,
    includedFieldCount: fields.filter((f) => f.included).length,
    includedKeySkillCount: builtKeySkills.length,
    missingRequired,
    fields,
    keySkills: builtKeySkills.map((skill) => ({
      title: skill.key_skill_title,
      display_value: skill.display_value,
      included: true,
    })),
  };
}
