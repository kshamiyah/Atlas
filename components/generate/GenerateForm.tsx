"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { GeneratedAIOutput } from "@/lib/ai/generate";
import { parseWriteEntryParams } from "@/lib/generate/query-params";
import { EntryTypePicker } from "./EntryTypePicker";
import { GenerateLoadingPanel } from "./GenerateLoadingPanel";
import { GeneratedResult } from "./GeneratedResult";
import {
  dismissWriteGettingStarted,
  readWriteGettingStartedDismissed,
  WriteGettingStarted,
} from "./WriteGettingStarted";

type KeySkill = {
  key_skill_id: string;
  title: string;
  cip_number: number | null;
  covered: boolean | null;
  evidence_count: number | null;
};

const LENGTH_OPTIONS: {
  value: "short" | "standard" | "detailed";
  label: string;
  hint: string;
}[] = [
  { value: "short", label: "Brief", hint: "~150 words" },
  { value: "standard", label: "Standard", hint: "~300 words" },
  { value: "detailed", label: "Detailed", hint: "~500 words" },
];

export function GenerateForm() {
  const searchParams = useSearchParams();
  const deepLink = parseWriteEntryParams(searchParams);

  const [entryType, setEntryType] = useState<GeneratedEntryType | null>(
    deepLink.entryType,
  );
  const [freeText, setFreeText] = useState("");
  const [date, setDate] = useState("");
  const [length, setLength] = useState<"short" | "standard" | "detailed">("standard");
  const [allSkills, setAllSkills] = useState<KeySkill[]>([]);
  const [targetSkillIds, setTargetSkillIds] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<GeneratedAIOutput | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const deepLinkSkillAppliedRef = useRef(false);

  useEffect(() => {
    setShowGettingStarted(!readWriteGettingStartedDismissed());
  }, []);

  useEffect(() => {
    if (deepLink.entryType) {
      setEntryType(deepLink.entryType);
    }
  }, [deepLink.entryType]);

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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deepLink.skillId || deepLinkSkillAppliedRef.current || allSkills.length === 0) {
      return;
    }
    const skill = allSkills.find((s) => s.key_skill_id === deepLink.skillId);
    if (!skill) return;
    deepLinkSkillAppliedRef.current = true;
    setTargetSkillIds([skill.key_skill_id]);
    setDeepLinkApplied(true);
  }, [allSkills, deepLink.skillId]);

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

  useEffect(() => {
    if (status === "loading") {
      const timer = window.setTimeout(() => {
        loadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return () => window.clearTimeout(timer);
    }
    if (status !== "done" || !result) return;
    const timer = window.setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [status, result]);

  function toggleTargetSkill(id: string) {
    setTargetSkillIds((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  function clearGeneratedResult() {
    if (status === "done") {
      setStatus("idle");
      setResult(null);
    }
  }

  function handleWriteAnotherEntry() {
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
    setFreeText("");
    window.setTimeout(() => {
      notesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function handleDismissGettingStarted() {
    dismissWriteGettingStarted();
    setShowGettingStarted(false);
  }

  const filteredSkills = allSkills.filter((s) =>
    s.title.toLowerCase().includes(skillSearch.toLowerCase()),
  );

  const deepLinkSkill = deepLink.skillId
    ? allSkills.find((s) => s.key_skill_id === deepLink.skillId)
    : null;

  async function handleGenerate() {
    if (!freeText.trim()) return;
    if (!entryType) {
      setErrorMsg("Choose an entry type in Entry settings before generating.");
      return;
    }
    setLoadingStartedAt(Date.now());
    setStatus("loading");
    setResult(null);
    setErrorMsg("");
    try {
      const res = await fetch("/api/generate/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_type: entryType,
          free_text: freeText,
          date: date || undefined,
          length,
          target_key_skill_ids: targetSkillIds,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Generation failed");
      setResult(json.result as GeneratedAIOutput);
      setStatus("done");
      setLoadingStartedAt(null);
      dismissWriteGettingStarted();
      setShowGettingStarted(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(
        message === "Failed to fetch"
          ? "Request timed out or the server did not respond. Generation can take 1–2 minutes — check the dev server is running and try again."
          : message,
      );
      setStatus("error");
      setLoadingStartedAt(null);
    }
  }

  const canGenerate = Boolean(freeText.trim() && entryType);

  return (
    <div className="space-y-5">
      {showGettingStarted ? (
        <WriteGettingStarted
          hasNotes={freeText.trim().length > 0}
          hasEntryType={entryType != null}
          hasGenerated={status === "done"}
          onDismiss={handleDismissGettingStarted}
        />
      ) : null}

      {deepLinkApplied && (deepLinkSkill || deepLink.cip != null) ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-accent-blue/25 bg-accent-blue/8 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-accent-blue">
              Linked from Progress
            </p>
            <p className="mt-1 text-sm text-primary">
              {deepLinkSkill ? (
                <>
                  Target skill: <span className="font-medium">{deepLinkSkill.title}</span>
                </>
              ) : (
                "Writing to close a curriculum gap"
              )}
            </p>
            {deepLink.cip != null ? (
              <p className="mt-0.5 text-xs text-secondary">CiP {deepLink.cip}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setDeepLinkApplied(false)}
            className="shrink-0 text-[11px] font-medium text-muted hover:text-secondary"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="order-1 space-y-4 lg:order-2">
          <section ref={notesRef} id="write-entry-notes" className="card scroll-mt-6 p-5 md:p-6">
            <div className="mb-3 border-b border-subtle pb-3">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Your notes
              </label>
              <p className="mt-1 text-xs text-secondary">
                Write what happened in your own words — names can be anonymised.
              </p>
            </div>
            <textarea
              rows={11}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              disabled={status === "loading"}
              placeholder="Example: Assisted with LSCS for FTP, supervised by consultant. Patient was anxious; I supported counselling and discussed post-op care and safety netting."
              className="app-input w-full resize-y px-3 py-3 text-[15px] leading-relaxed text-primary placeholder-muted disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={status === "loading" || !canGenerate}
                className="btn-primary px-4 py-2 text-small disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "loading" ? "Writing…" : "Generate entry"}
              </button>
              {status === "done" ? (
                <button
                  type="button"
                  onClick={handleWriteAnotherEntry}
                  className="rounded-full border border-subtle bg-surface-2 px-4 py-2 text-small font-medium text-secondary transition hover:bg-surface-3 hover:text-primary"
                >
                  Write another entry
                </button>
              ) : null}
              <span className="text-xs text-muted">
                {!entryType
                  ? "Choose an entry type in the panel first."
                  : status === "loading"
                    ? "Atlas is working — see progress below."
                    : "You can edit every field before copying to ePortfolio."}
              </span>
            </div>

            {status === "error" ? (
              <p className="mt-3 text-xs text-accent-red">{errorMsg}</p>
            ) : null}
          </section>

          {status === "loading" && loadingStartedAt != null ? (
            <div ref={loadingRef} id="generate-loading" className="scroll-mt-6">
              <GenerateLoadingPanel startedAt={loadingStartedAt} />
            </div>
          ) : null}

          {status === "done" && result && entryType ? (
            <div ref={resultRef} id="generated-entry-result" className="scroll-mt-6">
              <GeneratedResult
                result={result}
                entryType={entryType}
                rawInput={freeText}
                eventDate={date || undefined}
                length={length}
                onWriteAnother={handleWriteAnotherEntry}
              />
            </div>
          ) : null}
        </div>

        <aside className="order-2 lg:sticky lg:top-5 lg:z-20 lg:order-1 lg:self-start">
          <section className="card divide-y divide-subtle p-0">
            <div className="px-5 py-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                Entry settings
              </h2>
              <p className="mt-1 text-xs text-muted">
                Choose the ePortfolio form type first, then optional date, length, and key skills.
              </p>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  Entry type <span className="text-accent-red">*</span>
                </label>
                <EntryTypePicker
                  value={entryType}
                  onChange={setEntryType}
                  onClearResult={clearGeneratedResult}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  Date of event
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="app-input w-full px-3 py-2 text-xs text-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  Length
                </label>
                <div className="flex flex-wrap gap-2">
                  {LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLength(opt.value)}
                      title={opt.hint}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        length === opt.value
                          ? "border-accent-primary bg-accent-primary text-surface-1"
                          : "border-subtle bg-surface-3 text-secondary hover:bg-surface-4 hover:text-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted">
                  {LENGTH_OPTIONS.find((opt) => opt.value === length)?.hint}
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-muted">
                Target key skills
              </label>
              <p className="mt-1 text-[11px] text-muted">
                Up to 3 optional targets to steer output.
              </p>

              {targetSkillIds.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {targetSkillIds.map((id) => {
                    const skill = allSkills.find((s) => s.key_skill_id === id);
                    return (
                      <span
                        key={id}
                        className="flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-xs text-primary ring-1 ring-subtle"
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
              ) : null}

              <div ref={dropdownRef} className="relative z-30 mt-2">
                <input
                  type="text"
                  value={skillSearch}
                  onChange={(e) => {
                    setSkillSearch(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder={
                    targetSkillIds.length >= 3
                      ? "3 selected (remove one to add another)"
                      : "Search key skills…"
                  }
                  disabled={allSkills.length === 0}
                  className="app-input w-full px-3 py-2 text-xs text-primary placeholder-muted disabled:opacity-50"
                />
                {allSkills.length === 0 ? (
                  <p className="mt-1.5 text-[11px] text-muted">
                    Key skills load after your portfolio syncs.
                  </p>
                ) : null}

                {dropdownOpen && filteredSkills.length > 0 ? (
                  <ul
                    className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-subtle bg-surface-2 shadow-lg"
                    style={{
                      boxShadow:
                        "0 8px 32px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.06)",
                    }}
                  >
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
                                ? "bg-surface-3 font-medium text-primary"
                                : disabled
                                  ? "cursor-not-allowed opacity-40"
                                  : "text-primary hover:bg-surface-3"
                            }`}
                          >
                            <span className="flex-1">{skill.title}</span>
                            {skill.covered === false ? (
                              <span className="shrink-0 rounded-full bg-amber-900/40 px-1.5 py-0.5 text-amber-400">
                                gap
                              </span>
                            ) : null}
                            {skill.cip_number != null ? (
                              <span className="shrink-0 text-muted">
                                CiP {skill.cip_number}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
