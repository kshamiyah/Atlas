"use client";

import { useState } from "react";
import { ENTRY_TYPE_SCHEMAS } from "@/lib/constants/entry-schemas";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { GeneratedAIOutput } from "@/lib/ai/generate";
import { GeneratedResult } from "./GeneratedResult";

export function GenerateForm() {
  const [entryType, setEntryType] = useState<GeneratedEntryType>("reflection");
  const [freeText, setFreeText] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [result, setResult] = useState<GeneratedAIOutput | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleGenerate() {
    if (!freeText.trim()) return;
    setStatus("loading");
    setResult(null);
    setErrorMsg("");
    setSavedId(null);
    try {
      const res = await fetch("/api/generate/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_type: entryType,
          free_text: freeText,
          date: date || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Generation failed");
      setResult(json.result as GeneratedAIOutput);
      setSavedId(json.id ?? null);
      setStatus("done");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <label className="mb-3 block text-xs font-medium text-slate-400">
          Entry type
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ENTRY_TYPE_SCHEMAS) as GeneratedEntryType[]).map(
            (type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                setEntryType(type);
                // Clear a stale result — it belongs to the previous entry type
                if (status === "done") {
                  setStatus("idle");
                  setResult(null);
                }
              }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  entryType === type
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {ENTRY_TYPE_SCHEMAS[type].title}
              </button>
            )
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Date of event{" "}
            <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Describe what happened
          </label>
          <textarea
            rows={8}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Write a brief clinical description — the AI will expand this into a full portfolio entry. E.g. 'Assisted with LSCS for FTP, supervised by consultant, patient anxious, good outcome, discussed post-op care.'"
            className="w-full resize-y rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "loading" || !freeText.trim()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? "Generating…" : "Generate entry"}
        </button>

        {status === "error" && (
          <p className="text-xs text-red-400">{errorMsg}</p>
        )}
      </section>

      {status === "done" && result && (
        <GeneratedResult
          result={result}
          entryType={entryType}
          savedId={savedId}
        />
      )}
    </div>
  );
}
