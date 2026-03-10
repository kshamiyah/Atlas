"use client";

import { useState } from "react";
import { ENTRY_TYPE_SCHEMAS } from "@/lib/constants/entry-schemas";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { GeneratedAIOutput } from "@/lib/ai/generate";

type Props = {
  result: GeneratedAIOutput;
  entryType: GeneratedEntryType;
  savedId: string | null;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded px-2 py-0.5 text-xs text-slate-500 transition hover:bg-slate-700 hover:text-slate-300"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function GeneratedResult({
  result,
  entryType,
  savedId,
}: Props) {
  const schema = ENTRY_TYPE_SCHEMAS[entryType];
  const fields = schema?.fields ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-200">
          Generated entry
        </h2>
        {savedId && (
          <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-400">
            Saved
          </span>
        )}
      </div>

      <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        {fields.map((field) => {
          const value = result.fields[field.id];
          if (value === undefined || value === null || value === "")
            return null;
          const displayValue = String(value);
          return (
            <div key={field.id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {field.label}
                </span>
                <CopyButton text={displayValue} />
              </div>
              <pre className="whitespace-pre-wrap rounded-md bg-slate-800 px-3 py-2 text-xs leading-relaxed text-slate-200">
                {displayValue}
              </pre>
            </div>
          );
        })}
      </section>

      {result.suggested_key_skill_ids.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="mb-2 text-xs font-medium text-slate-400">
            Suggested key skills ({result.suggested_key_skill_ids.length})
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {result.suggested_key_skill_ids.map((id) => (
              <li
                key={id}
                className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300"
              >
                {id}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.notes.length > 0 && (
        <details className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">
            AI notes ({result.notes.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-3 text-xs text-slate-500">
            {result.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-slate-600">
        Stage: {result.stage_id}
        {result.inferred_level != null &&
          ` · Supervision level: ${result.inferred_level}`}
      </p>
    </div>
  );
}
