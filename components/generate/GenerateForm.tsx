"use client";

import { useEffect, useRef, useState } from "react";
import { ENTRY_TYPE_SCHEMAS } from "@/lib/constants/entry-schemas";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { GeneratedAIOutput } from "@/lib/ai/generate";
import { GeneratedResult } from "./GeneratedResult";

type KeySkill = {
  key_skill_id: string;
  title: string;
  cip_number: number | null;
  covered: boolean | null;
  evidence_count: number | null;
};

export function GenerateForm() {
  const [entryType, setEntryType] = useState<GeneratedEntryType | null>(null);
  const [freeText, setFreeText] = useState("");
  const [date, setDate] = useState("");
  const [length, setLength] = useState<"short" | "standard" | "detailed">("standard");
  const [allSkills, setAllSkills] = useState<KeySkill[]>([]);
  const [targetSkillIds, setTargetSkillIds] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<GeneratedAIOutput | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/generate/key-skills")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAllSkills(Array.isArray(d.skills) ? d.skills : []);
      })
      .catch(() => {
        if (cancelled) return;
        setAllSkills([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSkillSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleTargetSkill(id: string) {
    setTargetSkillIds((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  const filteredSkills = allSkills.filter((s) =>
    s.title.toLowerCase().includes(skillSearch.toLowerCase())
  );

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
          entry_type: entryType ?? undefined,
          free_text: freeText,
          date: date || undefined,
          length,
          target_key_skill_ids: targetSkillIds,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Generation failed");
      setResult(json.result as GeneratedAIOutput);
      setEntryType(json.result.entry_type as GeneratedEntryType);
      setSavedId(json.id ?? null);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <label className="mb-3 block text-micro font-medium text-muted">
          Entry type
        </label>
        <p className="mb-2 text-micro text-muted opacity-60">
          Optional — leave unselected to auto-detect
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ENTRY_TYPE_SCHEMAS) as GeneratedEntryType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setEntryType((prev) => (prev === type ? null : type));
                if (status === "done") {
                  setStatus("idle");
                  setResult(null);
                }
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                entryType === type
                  ? "bg-accent-green text-white"
                  : "bg-surface-3 text-secondary hover:bg-surface-4 hover:text-primary"
              }`}
            >
              {ENTRY_TYPE_SCHEMAS[type].title}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-micro font-medium text-muted">
            Date of event{" "}
            <span className="text-muted opacity-60">(optional)</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-subtle bg-surface-3 px-3 py-1.5 text-xs text-primary focus:border-accent-green focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-micro font-medium text-muted">
            Length
          </label>
          <div className="flex gap-2">
            {(["short", "standard", "detailed"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setLength(opt)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                  length === opt
                    ? "bg-accent-green text-white"
                    : "bg-surface-3 text-secondary hover:bg-surface-4 hover:text-primary"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Key skill targeting — searchable dropdown */}
        <div>
          <label className="mb-1.5 block text-micro font-medium text-muted">
            Target key skills{" "}
            <span className="text-muted opacity-60">(up to 3 — optional)</span>
          </label>

          {/* Selected chips */}
          {targetSkillIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {targetSkillIds.map((id) => {
                const skill = allSkills.find((s) => s.key_skill_id === id);
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 rounded-full bg-accent-green/20 px-2.5 py-1 text-xs text-accent-green ring-1 ring-accent-green/40"
                  >
                    {skill?.title ?? id}
                    <button
                      type="button"
                      onClick={() => toggleTargetSkill(id)}
                      className="ml-0.5 opacity-70 hover:opacity-100"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Dropdown */}
          <div ref={dropdownRef} className="relative">
            <input
              type="text"
              value={skillSearch}
              onChange={(e) => { setSkillSearch(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={
                targetSkillIds.length >= 3
                  ? "3 selected (remove one to add another)"
                  : "Search key skills…"
              }
              disabled={allSkills.length === 0}
              className="w-full rounded-md border border-subtle bg-surface-3 px-3 py-2 text-xs text-primary placeholder-muted focus:border-accent-green focus:outline-none disabled:opacity-50"
            />

            {dropdownOpen && filteredSkills.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-subtle bg-surface-2 shadow-lg">
                {filteredSkills.map((skill) => {
                  const selected = targetSkillIds.includes(skill.key_skill_id);
                  const disabled = !selected && targetSkillIds.length >= 3;
                  return (
                    <li key={skill.key_skill_id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          toggleTargetSkill(skill.key_skill_id);
                          setSkillSearch("");
                          setDropdownOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                          selected
                            ? "bg-accent-green/10 text-accent-green"
                            : disabled
                            ? "cursor-not-allowed opacity-40"
                            : "text-primary hover:bg-surface-3"
                        }`}
                      >
                        <span className="flex-1">{skill.title}</span>
                        {skill.covered === false && (
                          <span className="shrink-0 rounded-full bg-amber-900/40 px-1.5 py-0.5 text-amber-400">
                            gap
                          </span>
                        )}
                        {skill.cip_number != null && (
                          <span className="shrink-0 text-muted">
                            CiP {skill.cip_number}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-micro font-medium text-muted">
            Describe what happened
          </label>
          <textarea
            rows={8}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Write a brief clinical description — the AI will expand this into a full portfolio entry. E.g. 'Assisted with LSCS for FTP, supervised by consultant, patient anxious, good outcome, discussed post-op care.'"
            className="w-full resize-y rounded-md border border-subtle bg-surface-3 px-3 py-2 text-sm text-primary placeholder-muted focus:border-accent-green focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "loading" || !freeText.trim()}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? "Generating…" : "Generate entry"}
        </button>

        {status === "error" && (
          <p className="text-xs text-accent-red">{errorMsg}</p>
        )}
      </section>

      {status === "done" && result && entryType && (
        <GeneratedResult
          result={result}
          entryType={entryType}
          savedId={savedId}
        />
      )}
    </div>
  );
}
