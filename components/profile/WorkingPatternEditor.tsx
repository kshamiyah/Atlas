"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeWorkingPercent } from "@/lib/profile/ltft";

type Props = {
  initialWorkingPercent: number;
};

const QUICK_OPTIONS = [100, 90, 80, 70, 60, 50];

export function WorkingPatternEditor({ initialWorkingPercent }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(sanitizeWorkingPercent(initialWorkingPercent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== sanitizeWorkingPercent(initialWorkingPercent);
  const modeLabel = useMemo(
    () => (value >= 100 ? "Full-time" : `LTFT (${value}% WTE)`),
    [value],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/working-percent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ working_percent: value }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to save working pattern");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save working pattern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUICK_OPTIONS.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setValue(option)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition"
              style={
                active
                  ? {
                      border: "1px solid rgba(0,113,227,0.35)",
                      background: "rgba(0,113,227,0.10)",
                      color: "var(--accent-blue)",
                    }
                  : {
                      border: "1px solid var(--border-subtle)",
                      background: "var(--surface-1)",
                      color: "var(--text-secondary)",
                    }
              }
            >
              {option === 100 ? "100%" : `${option}%`}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 rounded-xl border border-subtle bg-surface-1 p-3">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: "var(--text-muted)" }}>Current pattern</span>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {modeLabel}
          </span>
        </div>

        <input
          type="range"
          min={50}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(sanitizeWorkingPercent(e.target.value))}
          className="w-full accent-[var(--accent-blue)]"
          aria-label="Working pattern percentage"
        />

        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>50% LTFT</span>
          <span>100% Full-time</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          This setting adjusts LTFT-aware ARCP timing across your dashboard.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--accent-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
