"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ENTRY_TYPE_SCHEMAS,
  type EntryField,
} from "@/lib/constants/entry-schemas";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { GeneratedAIOutput } from "@/lib/ai/generate";
import { KaizenFillBar } from "./KaizenFillBar";

type Props = {
  result: GeneratedAIOutput;
  entryType: GeneratedEntryType;
  rawInput: string;
  eventDate?: string;
  length?: "short" | "standard" | "detailed";
  onWriteAnother?: () => void;
};

function formatFieldValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "true" : "false";
  return String(raw);
}

function buildInitialFieldValues(
  fields: EntryField[],
  resultFields: Record<string, unknown>,
  eventDate?: string,
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const fromResult = resultFields[field.id];
      if (fromResult !== null && fromResult !== undefined && fromResult !== "") {
        return [field.id, formatFieldValue(fromResult)];
      }
      if (field.id === "date" && eventDate) {
        return [field.id, eventDate];
      }
      return [field.id, ""];
    }),
  );
}

function fieldSupportsRegeneration(field: EntryField): boolean {
  return field.type === "text" || field.type === "string";
}

function EntryFieldInput({
  field,
  value,
  onChange,
}: {
  field: EntryField;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `field-${field.id}`;

  if (field.type === "date") {
    return (
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="app-input w-full max-w-xs px-3 py-2 text-sm text-primary"
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-subtle bg-surface-2/60 px-3 py-2.5"
      >
        <input
          id={inputId}
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          className="h-4 w-4 rounded border-subtle"
        />
        <span className="text-sm text-secondary">
          {field.id === "request_assessment"
            ? "Request OSATS assessment for this procedure"
            : "Yes"}
        </span>
      </label>
    );
  }

  if ((field.type === "select" || field.type === "integer") && field.options?.length) {
    return (
      <select
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="app-input w-full max-w-md px-3 py-2 text-sm text-primary"
      >
        <option value="">Choose…</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  const isShort =
    field.type === "string" ||
    field.id === "title" ||
    field.id === "assessor" ||
    field.id === "log_procedure";

  return (
    <textarea
      id={inputId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={
        isShort
          ? 1
          : field.id === "record_of_discussion_or_action_plan"
            ? 4
            : 5
      }
      placeholder={field.required ? `Add ${field.label.toLowerCase()}…` : undefined}
      className={`app-input w-full resize-y text-primary ${
        field.id === "title"
          ? "px-3 py-2.5 text-[15px] font-medium leading-snug"
          : "px-3 py-2.5 text-[14px] leading-relaxed"
      }`}
    />
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="rounded-lg border border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-surface-3 hover:text-primary"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function RegenerateButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title="Regenerate this field"
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-primary disabled:opacity-40"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={loading ? "animate-spin" : undefined}
        aria-hidden
      >
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    </button>
  );
}

export function GeneratedResult({
  result,
  entryType,
  rawInput,
  eventDate,
  length,
  onWriteAnother,
}: Props) {
  const schema = ENTRY_TYPE_SCHEMAS[entryType];
  const fields = schema?.fields ?? [];

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    buildInitialFieldValues(fields, result.fields, eventDate),
  );
  const [regenLoading, setRegenLoading] = useState<Record<string, boolean>>({});

  const skillIdsKey = result.suggested_key_skills_detail
    .map((skill) => skill.key_skill_id)
    .join("|");

  const [includedSkillIds, setIncludedSkillIds] = useState<Set<string>>(
    () => new Set(result.suggested_key_skills_detail.map((skill) => skill.key_skill_id)),
  );

  useEffect(() => {
    setIncludedSkillIds(
      new Set(result.suggested_key_skills_detail.map((skill) => skill.key_skill_id)),
    );
  }, [skillIdsKey]);

  const skillCount = result.suggested_key_skills_detail.length;
  const includedSkillCount = result.suggested_key_skills_detail.filter((skill) =>
    includedSkillIds.has(skill.key_skill_id),
  ).length;

  const selectedKeySkillsForFill = useMemo(
    () =>
      result.suggested_key_skills_detail
        .filter((skill) => includedSkillIds.has(skill.key_skill_id))
        .map((skill) => ({
          key_skill_id: skill.key_skill_id,
          title: skill.title,
          cip_number: skill.cip_number,
          kaizen_ids: skill.kaizen_ids ?? [],
        })),
    [includedSkillIds, result.suggested_key_skills_detail],
  );

  function toggleSkillForKaizen(skillId: string) {
    setIncludedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  function selectAllSkillsForKaizen() {
    setIncludedSkillIds(
      new Set(result.suggested_key_skills_detail.map((skill) => skill.key_skill_id)),
    );
  }

  function clearAllSkillsForKaizen() {
    setIncludedSkillIds(new Set());
  }

  async function handleRegenField(fieldId: string, fieldLabel: string) {
    setRegenLoading((prev) => ({ ...prev, [fieldId]: true }));
    try {
      const res = await fetch("/api/generate/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_type: entryType,
          field_id: fieldId,
          field_label: fieldLabel,
          raw_input: rawInput,
          current_fields: fieldValues,
          length: length ?? "standard",
        }),
      });
      const json = await res.json();
      if (res.ok && typeof json.value === "string") {
        setFieldValues((prev) => ({ ...prev, [fieldId]: json.value }));
      }
    } catch {
      // keep existing value
    } finally {
      setRegenLoading((prev) => ({ ...prev, [fieldId]: false }));
    }
  }

  function handleCopyAll() {
    const blocks = fields
      .map((field) => {
        const value = fieldValues[field.id]?.trim();
        if (!value) return null;
        return `${field.label}\n${value}`;
      })
      .filter(Boolean)
      .join("\n\n");
    void navigator.clipboard.writeText(blocks);
  }

  return (
    <div className="space-y-4">
      {onWriteAnother ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-subtle bg-surface-2/60 px-4 py-3">
          <p className="text-xs text-secondary">
            Done with this entry? Start fresh notes for the next one — entry settings
            are kept.
          </p>
          <button
            type="button"
            onClick={onWriteAnother}
            className="shrink-0 rounded-full border border-subtle bg-surface-1 px-4 py-2 text-[12px] font-semibold text-primary transition hover:bg-surface-3"
          >
            Write another entry
          </button>
        </div>
      ) : null}

      <KaizenFillBar
        entryType={entryType}
        fieldValues={fieldValues}
        suggestedKeySkills={selectedKeySkillsForFill}
        totalSuggestedKeySkillCount={skillCount}
        inferredLevel={result.inferred_level}
        onCopyAll={handleCopyAll}
      />

      {/* Entry fields */}
      <section className="card overflow-hidden p-0">
        <div className="border-b border-subtle px-5 py-3.5 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-primary">Entry fields</h2>
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-muted">
              {schema.title}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {fields.length} fields for this ePortfolio form — review before copying.
          </p>
        </div>

        <div className="divide-y divide-subtle">
          {fields.map((field) => {
            const value = fieldValues[field.id] ?? "";
            const isRegen = !!regenLoading[field.id];

            return (
              <div key={field.id} className="px-5 py-4 md:px-6">
                <div className="mb-2 flex items-center gap-2">
                  <label
                    htmlFor={`field-${field.id}`}
                    className="flex-1 text-xs font-medium text-secondary"
                  >
                    {field.label}
                    {field.required ? (
                      <span className="ml-1 text-accent-red" aria-hidden>
                        *
                      </span>
                    ) : null}
                  </label>
                  {fieldSupportsRegeneration(field) ? (
                    <RegenerateButton
                      onClick={() => handleRegenField(field.id, field.label)}
                      loading={isRegen}
                    />
                  ) : null}
                  {value.trim() ? <CopyButton text={value} /> : null}
                </div>
                <EntryFieldInput
                  field={field}
                  value={value}
                  onChange={(next) =>
                    setFieldValues((prev) => ({
                      ...prev,
                      [field.id]: next,
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Curriculum mapping */}
      <section className="card overflow-hidden p-0">
        <div className="border-b border-subtle px-5 py-3.5 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-primary">
                  Curriculum mapping
                </h2>
                {skillCount > 0 ? (
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-muted">
                    {includedSkillCount} of {skillCount} for ePortfolio
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Tick skills to include when you Fill in ePortfolio. Descriptors are
                for review only.
              </p>
            </div>
            {skillCount > 0 ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllSkillsForKaizen}
                  disabled={includedSkillCount === skillCount}
                  className="rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-secondary transition hover:bg-surface-3 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAllSkillsForKaizen}
                  disabled={includedSkillCount === 0}
                  className="rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-[10px] font-medium text-secondary transition hover:bg-surface-3 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-4 md:p-5">
          {skillCount > 0 ? (
            <ul className="space-y-3">
              {result.suggested_key_skills_detail.map((skill) => {
                const evidencedSet = new Set(skill.evidenced_descriptors);
                const descriptorRows =
                  skill.all_descriptors.length > 0
                    ? skill.all_descriptors
                    : skill.evidenced_descriptors;
                const evidencedCount = descriptorRows.filter((d) =>
                  evidencedSet.has(d),
                ).length;
                const includedForKaizen = includedSkillIds.has(skill.key_skill_id);
                const checkboxId = `kaizen-skill-${skill.key_skill_id}`;

                return (
                  <li
                    key={skill.key_skill_id}
                    className={`rounded-xl border p-4 transition ${
                      includedForKaizen
                        ? "border-subtle bg-surface-2/60"
                        : "border-subtle/70 bg-surface-2/30 opacity-80"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <label
                        htmlFor={checkboxId}
                        className="flex shrink-0 cursor-pointer items-start gap-2 pt-0.5"
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={includedForKaizen}
                          onChange={() => toggleSkillForKaizen(skill.key_skill_id)}
                          className="mt-0.5 h-4 w-4 rounded border-subtle"
                        />
                        <span className="text-[10px] font-medium leading-snug text-muted">
                          Include in ePortfolio
                        </span>
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold leading-snug text-primary">
                              {skill.title}
                            </p>
                            {skill.rationale ? (
                              <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                                {skill.rationale}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            {skill.cip_number != null ? (
                              <span className="rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-muted">
                                CiP {skill.cip_number}
                              </span>
                            ) : null}
                            {skill.covered === false ? (
                              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                Gap
                              </span>
                            ) : null}
                            {descriptorRows.length > 0 ? (
                              <span className="rounded-full bg-accent-green/10 px-2 py-0.5 text-[10px] font-medium text-accent-green">
                                {evidencedCount}/{descriptorRows.length} descriptors
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {descriptorRows.length > 0 ? (
                          <ul className="mt-3 space-y-1.5">
                            {descriptorRows.map((descriptor) => {
                              const evidenced = evidencedSet.has(descriptor);
                              return (
                                <li
                                  key={descriptor}
                                  className={`flex gap-2 rounded-lg px-2.5 py-2 text-[11px] leading-snug ${
                                    evidenced
                                      ? "bg-accent-green/8 text-secondary"
                                      : "text-muted"
                                  }`}
                                >
                                  <span
                                    className={`mt-0.5 shrink-0 font-semibold ${
                                      evidenced ? "text-accent-green" : "text-muted"
                                    }`}
                                    aria-hidden
                                  >
                                    {evidenced ? "✓" : "○"}
                                  </span>
                                  <span>{descriptor}</span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-subtle bg-surface-2/40 px-4 py-6 text-center text-sm text-muted">
              No curriculum suggestions yet. Sync your portfolio or pick target
              key skills before generating.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
