"use client";

import { useState } from "react";
import { ENTRY_TYPE_SCHEMAS } from "@/lib/constants/entry-schemas";
import {
  buildKaizenNewEntryUrl,
  kaizenEntryTypeLabel,
} from "@/lib/kaizen/entry-urls";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { GeneratedAIOutput } from "@/lib/ai/generate";

type Props = {
  result: GeneratedAIOutput;
  entryType: GeneratedEntryType;
  savedId: string | null;
  rawInput: string;
  length?: "short" | "standard" | "detailed";
};

function CopyButton({ text }: { text: string }) {
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
      className="flex h-[26px] items-center rounded-full border px-2.5 text-[11px] font-medium transition"
      style={{
        background: "var(--surface-3)",
        color: "var(--text-muted)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {copied ? "Copied" : "Copy"}
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
      className="flex h-[26px] w-[26px] items-center justify-center rounded-full border transition hover:bg-surface-3 disabled:opacity-40"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-muted)",
      }}
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
        style={{ animation: loading ? "spin 0.7s linear infinite" : "none" }}
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
  savedId,
  rawInput,
  length,
}: Props) {
  const schema = ENTRY_TYPE_SCHEMAS[entryType];
  const fields = schema?.fields ?? [];

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [f.id, String(result.fields[f.id] ?? "")]),
    ),
  );
  const [regenLoading, setRegenLoading] = useState<Record<string, boolean>>({});
  const [fillState, setFillState] = useState<"idle" | "queued">("idle");

  const kaizenFormUrl = buildKaizenNewEntryUrl(entryType);
  const kaizenFormLabel = kaizenEntryTypeLabel(entryType);

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
      // silently keep existing value
    } finally {
      setRegenLoading((prev) => ({ ...prev, [fieldId]: false }));
    }
  }

  function handleFillKaizen() {
    const payload = {
      entry_type: entryType,
      fields: fieldValues,
      stored_at: Date.now(),
    };
    // Send postMessage — the extension's content-portfolioiq.js relays it to
    // chrome.storage.local so content-form-fill.js on Kaizen can pick it up.
    window.postMessage({ type: "PORTFOLIOIQ_QUEUE_FILL", payload }, "*");
    setFillState("queued");
    setTimeout(() => {
      window.open(kaizenFormUrl, "_blank");
      setTimeout(() => setFillState("idle"), 3000);
    }, 120);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-accent-blue/20 bg-accent-blue/6 px-4 py-3.5 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-accent-blue">
              Copy to Kaizen
            </p>
            <ol className="mt-2 space-y-1 text-[12px] leading-relaxed text-secondary">
              <li>
                <span className="font-medium text-primary">1.</span> Edit any field below
              </li>
              <li>
                <span className="font-medium text-primary">2.</span> Click{" "}
                <span className="font-medium text-primary">Fill in Kaizen</span> — Atlas
                queues your text
              </li>
              <li>
                <span className="font-medium text-primary">3.</span> Complete the{" "}
                <span className="font-medium text-primary">{kaizenFormLabel}</span> form
                in Kaizen; fields populate automatically
              </li>
            </ol>
            <p className="mt-2 text-[11px] text-muted">
              Opens{" "}
              <a
                href={kaizenFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent-blue hover:underline"
              >
                {kaizenFormLabel} on RCOG Training ePortfolio
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={handleFillKaizen}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent-primary bg-accent-primary px-3.5 py-2 text-[12px] font-semibold text-surface-1 transition hover:opacity-90"
          >
            {fillState === "queued" ? (
              <>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Opening Kaizen…
              </>
            ) : (
              <>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Fill in Kaizen
              </>
            )}
          </button>
        </div>
      </section>

      {/* ── Header row ── */}
      <div className="flex flex-wrap items-center gap-2.5 px-1">
        <h2
          className="text-heading-3 font-semibold text-primary"
          style={{ letterSpacing: "-0.014em" }}
        >
          Generated entry
        </h2>

        {savedId && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{
              background: "rgba(22,163,74,0.10)",
              color: "var(--accent-green)",
            }}
          >
            Saved
          </span>
        )}

        {result.inferred_level != null && (
          <span
            className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-3)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            Level {result.inferred_level} supervision
          </span>
        )}
      </div>

      {/* ── Fields card + key skills strip ── */}
      <section className="card divide-y divide-subtle overflow-hidden p-0">
        {fields.map((field) => {
          const value = fieldValues[field.id];
          if (value === undefined || value === null || value === "") return null;
          const isRegen = !!regenLoading[field.id];
          return (
            <div key={field.id} className="px-5 py-4 md:px-6">
              <div className="mb-2 flex items-center gap-1.5">
                <span
                  className="flex-1 text-[11px] font-semibold uppercase"
                  style={{
                    color: "var(--text-muted)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {field.label}
                </span>
                <RegenerateButton
                  onClick={() => handleRegenField(field.id, field.label)}
                  loading={isRegen}
                />
                <CopyButton text={value} />
              </div>
              <textarea
                value={value}
                onChange={(e) =>
                  setFieldValues((prev) => ({
                    ...prev,
                    [field.id]: e.target.value,
                  }))
                }
                rows={field.type === "string" ? 1 : 5}
                className="app-input w-full resize-y px-3 py-2 text-[14px] leading-relaxed text-primary"
              />
            </div>
          );
        })}

        {/* Curriculum mapping — key skills + descriptors */}
        <div className="px-5 py-4 md:px-6">
          <p
            className="mb-1 text-[11px] font-semibold uppercase text-muted"
            style={{ letterSpacing: "0.06em" }}
          >
            Curriculum mapping
            {result.suggested_key_skills_detail.length > 0
              ? ` (${result.suggested_key_skills_detail.length} key skills)`
              : ""}
          </p>
          <p className="mb-3 text-[11px] text-muted">
            Key skills and descriptors this entry may evidence in Kaizen.
          </p>
          {result.suggested_key_skills_detail.length > 0 ? (
            <ul className="space-y-3">
              {result.suggested_key_skills_detail.map((skill) => {
                const evidencedSet = new Set(skill.evidenced_descriptors);
                const descriptorRows =
                  skill.all_descriptors.length > 0
                    ? skill.all_descriptors
                    : skill.evidenced_descriptors;

                return (
                  <li
                    key={skill.key_skill_id}
                    className="rounded-xl border px-3 py-2.5"
                    style={{
                      background: "var(--surface-3)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-primary">
                        {skill.title}
                      </span>
                      {skill.cip_number != null && (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                          CiP {skill.cip_number}
                        </span>
                      )}
                      {skill.covered === false && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: "rgba(245,158,11,0.12)",
                            color: "var(--accent-amber)",
                          }}
                        >
                          portfolio gap
                        </span>
                      )}
                    </div>
                    {skill.rationale ? (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
                        {skill.rationale}
                      </p>
                    ) : null}
                    {descriptorRows.length > 0 ? (
                      <div className="mt-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
                          Descriptors
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {descriptorRows.map((descriptor) => {
                            const evidenced = evidencedSet.has(descriptor);
                            return (
                              <li
                                key={descriptor}
                                className={`rounded-md px-2 py-1.5 text-[11px] leading-snug ${
                                  evidenced
                                    ? "bg-accent-green/10 text-secondary"
                                    : "bg-surface-2/80 text-muted"
                                }`}
                              >
                                {evidenced ? "✓ " : "○ "}
                                {descriptor}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] leading-relaxed text-muted">
              No suggestions yet. Sync your portfolio for gap-aware matches, or
              pick target key skills before generating.
            </p>
          )}
        </div>
      </section>

      {/* ── AI Notes ── */}
      {result.notes.length > 0 && (
        <details className="card p-5 md:p-6">
          <summary
            className="cursor-pointer text-[11px] font-semibold uppercase text-muted"
            style={{ letterSpacing: "0.06em" }}
          >
            AI notes ({result.notes.length})
          </summary>
          <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-secondary">
            {result.notes.map((note, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 shrink-0 text-muted">·</span>
                {note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
