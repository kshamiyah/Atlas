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
  const [fieldValues, setFieldValues] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      fields.map((f) => [f.id, String(result.fields[f.id] ?? "")])
    )
  );

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
          return (
            <div key={field.id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {field.label}
                </span>
                <CopyButton text={fieldValues[field.id]} />
              </div>
              <textarea
                value={fieldValues[field.id]}
                onChange={(e) =>
                  setFieldValues((prev) => ({
                    ...prev,
                    [field.id]: e.target.value,
                  }))
                }
                rows={field.type === "string" ? 1 : 5}
                className="w-full resize-y rounded-md border border-subtle bg-surface-3 px-3 py-2 text-sm text-primary focus:border-accent-green focus:outline-none"
              />
            </div>
          );
        })}
      </section>

      {result.suggested_key_skills_detail.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="mb-3 text-xs font-medium text-slate-400">
            Suggested key skills ({result.suggested_key_skills_detail.length})
          </h3>
          <ul className="space-y-3">
            {result.suggested_key_skills_detail.map((skill) => (
              <li
                key={skill.key_skill_id}
                className="rounded-md bg-slate-800 p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-200">
                    {skill.title}
                  </span>
                  {skill.cip_number != null && (
                    <span className="text-xs text-slate-500">
                      CiP {skill.cip_number}
                    </span>
                  )}
                  {skill.covered === false && (
                    <span className="rounded-full bg-amber-900/50 px-2 py-0.5 text-xs text-amber-400">
                      gap
                    </span>
                  )}
                </div>
                {skill.rationale && (
                  <p className="text-xs leading-relaxed text-slate-500">
                    {skill.rationale}
                  </p>
                )}
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
