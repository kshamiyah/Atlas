"use client";

import { useMemo, useState } from "react";
import {
  buildKaizenFillPayload,
  previewKaizenFill,
} from "@/lib/kaizen/fill-payload";
import {
  buildKaizenFillTargetUrl,
  buildKaizenNewEntryUrl,
  kaizenEntryTypeLabel,
  KAIZEN_ADD_MANUAL_HINT,
  KAIZEN_DASHBOARD_URL,
} from "@/lib/kaizen/entry-urls";
import type { GeneratedEntryType } from "@/lib/types/entries";
import type { KaizenFillKeySkillInput } from "@/lib/kaizen/fill-payload";
import {
  useKaizenFillBridge,
  type KaizenBridgeStatus,
} from "./useKaizenFillBridge";

type Props = {
  entryType: GeneratedEntryType;
  fieldValues: Record<string, string>;
  suggestedKeySkills: KaizenFillKeySkillInput[];
  totalSuggestedKeySkillCount?: number;
  inferredLevel: number | null;
  onCopyAll: () => void;
};

type FillPhase =
  | "idle"
  | "queuing"
  | "opening"
  | "opened_with_warning";

function bridgeHint(
  status: KaizenBridgeStatus,
  extensionPresent: boolean,
  lastQueueError: string | null,
): {
  tone: "ready" | "missing" | "checking" | "warning";
  text: string;
} | null {
  if (lastQueueError && extensionPresent) {
    return {
      tone: "warning",
      text: lastQueueError,
    };
  }

  if (status === "checking") {
    return {
      tone: "checking",
      text: "Checking for the Atlas Chrome extension…",
    };
  }

  if (extensionPresent || status === "ready") {
    return {
      tone: "ready",
      text: "Atlas extension connected — fields will auto-fill on the Kaizen form.",
    };
  }

  return {
    tone: "missing",
    text: "Atlas extension not detected on this tab. Fill in Kaizen will still open the form, but you may need to paste fields manually.",
  };
}

export function KaizenFillBar({
  entryType,
  fieldValues,
  suggestedKeySkills,
  totalSuggestedKeySkillCount = 0,
  inferredLevel,
  onCopyAll,
}: Props) {
  const { status: bridgeStatus, extensionPresent, lastQueueError, queueFill, recheck } =
    useKaizenFillBridge();
  const [phase, setPhase] = useState<FillPhase>("idle");
  const [showPreview, setShowPreview] = useState(false);

  const preview = useMemo(
    () => previewKaizenFill(entryType, fieldValues, suggestedKeySkills),
    [entryType, fieldValues, suggestedKeySkills],
  );

  const kaizenFormUrl = buildKaizenFillTargetUrl(entryType);
  const kaizenFormLabel = kaizenEntryTypeLabel(entryType);
  const hint = bridgeHint(bridgeStatus, extensionPresent, lastQueueError);

  async function handleFillKaizen() {
    if (preview.includedFieldCount === 0 && preview.includedKeySkillCount === 0) {
      return;
    }

    setPhase("queuing");
    const payload = buildKaizenFillPayload(
      entryType,
      fieldValues,
      suggestedKeySkills,
    );
    const result = await queueFill(payload);

    if (!result.ok) {
      setPhase("opened_with_warning");
      window.open(kaizenFormUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => setPhase("idle"), 5000);
      return;
    }

    setPhase("opening");
    window.setTimeout(() => {
      window.open(kaizenFormUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => setPhase("idle"), 3000);
    }, 120);
  }

  const fillDisabled =
    phase === "queuing" ||
    phase === "opening" ||
    (preview.includedFieldCount === 0 && preview.includedKeySkillCount === 0);

  const fillLabel =
    phase === "queuing"
      ? "Queuing fields…"
      : phase === "opening"
        ? "Opening Kaizen…"
        : phase === "opened_with_warning"
          ? "Opened Kaizen — check auto-fill"
          : "Fill in Kaizen";

  return (
    <section className="card overflow-hidden p-0">
      <div className="border-b border-subtle bg-accent-blue/5 px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-blue">
                Copy to Kaizen
              </p>
              {inferredLevel != null ? (
                <span className="rounded-full border border-subtle bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-secondary">
                  Level {inferredLevel}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm text-secondary">
              Send{" "}
              <span className="font-medium text-primary">{preview.includedFieldCount}</span>{" "}
              field{preview.includedFieldCount === 1 ? "" : "s"}
              {preview.includedKeySkillCount > 0 ? (
                <>
                  {" "}
                  and{" "}
                  <span className="font-medium text-primary">
                    {preview.includedKeySkillCount}
                  </span>{" "}
                  key skill{preview.includedKeySkillCount === 1 ? "" : "s"}
                </>
              ) : null}{" "}
              to{" "}
              <span className="font-medium text-primary">{kaizenFormLabel}</span>.
            </p>
            <p className="mt-1 text-xs text-muted">
              Opens{" "}
              <a
                href={kaizenFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent-blue hover:underline"
              >
                new {kaizenFormLabel} form
              </a>
              {extensionPresent
                ? " — fields populate automatically."
                : `. ${KAIZEN_ADD_MANUAL_HINT}`}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCopyAll}
              className="rounded-full border border-subtle bg-surface-2 px-3.5 py-2 text-[12px] font-medium text-secondary transition hover:bg-surface-3 hover:text-primary"
            >
              Copy all
            </button>
            <button
              type="button"
              onClick={handleFillKaizen}
              disabled={fillDisabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-primary bg-accent-primary px-4 py-2 text-[12px] font-semibold text-surface-1 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fillLabel}
            </button>
          </div>
        </div>

        {hint ? (
          <div
            className={`mt-3 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed ${
              hint.tone === "missing"
                ? "border border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-200"
                : hint.tone === "warning"
                  ? "border border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-200"
                  : hint.tone === "checking"
                    ? "border border-subtle bg-surface-2/80 text-muted"
                    : "border border-accent-green/20 bg-accent-green/8 text-secondary"
            }`}
          >
            <p>{hint.text}</p>
            {hint.tone === "missing" ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px]">
                <li>Install or enable the Atlas extension in Chrome.</li>
                <li>
                  Reload this page after enabling the extension (use{" "}
                  <span className="font-medium">localhost:3000</span> or{" "}
                  <span className="font-medium">127.0.0.1:3000</span>).
                </li>
                <li>
                  Open the extension popup →{" "}
                  <a
                    href="/login?source=extension"
                    className="font-medium text-accent-blue hover:underline"
                  >
                    Connect to Atlas
                  </a>{" "}
                  if you have not signed in on this browser.
                </li>
                <li>
                  After extension updates, click <span className="font-medium">Reload</span>{" "}
                  on the Atlas card in{" "}
                  <span className="font-medium">chrome://extensions</span>.
                </li>
              </ul>
            ) : null}
            {hint.tone === "missing" || hint.tone === "warning" ? (
              <button
                type="button"
                onClick={recheck}
                className="mt-2 rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-[10px] font-medium text-secondary transition hover:bg-surface-3 hover:text-primary"
              >
                Check again
              </button>
            ) : null}
          </div>
        ) : null}

        {preview.missingRequired.length > 0 ? (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            Missing required:{" "}
            {preview.missingRequired.map((f) => f.label).join(", ")} — fill these
            before submitting in Kaizen.
          </p>
        ) : null}

        {totalSuggestedKeySkillCount > 0 && preview.includedKeySkillCount === 0 ? (
          <p className="mt-2 text-[11px] text-muted">
            No key skills selected — fields will still fill. Link skills manually
            in Kaizen if needed.
          </p>
        ) : null}
      </div>

      <div className="px-4 py-3 md:px-5">
        <button
          type="button"
          onClick={() => setShowPreview((open) => !open)}
          className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-secondary transition hover:text-primary"
          aria-expanded={showPreview}
        >
          <span>
            {showPreview ? "Hide" : "Show"} fill preview ({preview.includedFieldCount}/
            {preview.mappableFieldCount} fields
            {totalSuggestedKeySkillCount > 0
              ? `, ${preview.includedKeySkillCount}/${totalSuggestedKeySkillCount} key skills`
              : preview.includedKeySkillCount > 0
                ? `, ${preview.includedKeySkillCount} key skills`
                : ""}
            )
          </span>
          <span className="text-muted" aria-hidden>
            {showPreview ? "▾" : "▸"}
          </span>
        </button>

        {showPreview ? (
          <ul className="mt-2 space-y-1.5">
            {preview.fields.map((field) => (
              <li
                key={field.id}
                className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px] ${
                  field.included
                    ? "bg-accent-green/8 text-secondary"
                    : field.mapped
                      ? "bg-surface-2/80 text-muted"
                      : "bg-surface-2/40 text-muted"
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 font-semibold ${
                    field.included ? "text-accent-green" : "text-muted"
                  }`}
                  aria-hidden
                >
                  {field.included ? "✓" : field.mapped ? "○" : "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-primary">{field.label}</span>
                  {field.included ? (
                    <span className="mt-0.5 block truncate text-muted">
                      {field.value.length > 72
                        ? `${field.value.slice(0, 72)}…`
                        : field.value}
                    </span>
                  ) : field.mapped ? (
                    <span className="mt-0.5 block text-muted">Empty — skipped</span>
                  ) : (
                    <span className="mt-0.5 block text-muted">Not mapped to Kaizen</span>
                  )}
                </span>
              </li>
            ))}
            {preview.keySkills.map((skill) => (
              <li
                key={skill.display_value}
                className="flex items-start gap-2 rounded-lg bg-accent-green/8 px-2.5 py-2 text-[11px] text-secondary"
              >
                <span className="mt-0.5 shrink-0 font-semibold text-accent-green" aria-hidden>
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-primary">Key skill</span>
                  <span className="mt-0.5 block truncate text-muted">
                    {skill.display_value}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-3 text-[10px] text-muted">
          Kaizen form URL:{" "}
          <a
            href={kaizenFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-secondary hover:underline"
          >
            {buildKaizenNewEntryUrl(entryType).replace(/^https?:\/\//, "")}
          </a>
          . If this fails, use{" "}
          <a
            href={KAIZEN_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-secondary hover:underline"
          >
            dashboard Add menu
          </a>
          .
        </p>
      </div>
    </section>
  );
}
