"use client";

import { useState } from "react";
import NextImage from "next/image";

type ProfilePhotoEditorProps = {
  initialPhotoUrl: string | null;
  displayName: string | null;
  allowSave: boolean;
  embedded?: boolean;
};

function initialsFromName(name: string | null): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "PI";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function sanitizePhotoInput(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return null;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function downscaleImage(dataUrl: string, maxSize = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const targetW = Math.max(1, Math.round(img.width * ratio));
      const targetH = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not process image"));
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = dataUrl;
  });
}

export function ProfilePhotoEditor({
  initialPhotoUrl,
  displayName,
  allowSave,
  embedded = false,
}: ProfilePhotoEditorProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return initialPhotoUrl;
    const local = window.localStorage.getItem("piq.profile.photo");
    return sanitizePhotoInput(initialPhotoUrl) ?? sanitizePhotoInput(local);
  });
  const [manualUrl, setManualUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function persist(nextUrl: string | null) {
    if (typeof window !== "undefined") {
      if (nextUrl) {
        window.localStorage.setItem("piq.profile.photo", nextUrl);
      } else {
        window.localStorage.removeItem("piq.profile.photo");
      }
    }

    setPhotoUrl(nextUrl);
    if (!allowSave) {
      setMessage("Saved locally for this browser (dev mode).");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/photo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: nextUrl }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to save photo");
      }
      setMessage("Profile photo saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`Saved locally only: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function onFileChange(file: File | null) {
    if (!file) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const raw = await fileToDataUrl(file);
      const resized = await downscaleImage(raw);
      await persist(resized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg);
      setIsSaving(false);
    }
  }

  function applyManualUrl() {
    const value = sanitizePhotoInput(manualUrl);
    if (!value) {
      setMessage("Please provide a valid image URL (http/https).");
      return;
    }
    void persist(value);
  }

  return (
    <div className={embedded ? "space-y-3" : "card p-4 md:p-5"}>
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-subtle bg-surface-3">
          {photoUrl ? (
            <NextImage
              src={photoUrl}
              alt="Profile photo"
              fill
              unoptimized
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-small font-semibold text-secondary">
              {initialsFromName(displayName)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-small font-medium text-primary">Profile picture</h3>
          <p className="text-xs text-secondary">Upload an image or paste an image URL.</p>
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs">
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0] ?? null;
                  void onFileChange(file);
                  e.currentTarget.value = "";
                }}
                disabled={isSaving}
              />
            </label>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => void persist(null)}
              disabled={isSaving}
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="https://example.com/photo.jpg"
          className="h-9 w-full rounded-xl border border-subtle bg-surface-1 px-3 text-xs text-primary outline-none placeholder:text-muted focus:border-[var(--accent-blue)]"
          disabled={isSaving}
        />
        <button
          type="button"
          className="btn-primary h-9 px-3 text-xs"
          onClick={applyManualUrl}
          disabled={isSaving}
        >
          Save URL
        </button>
      </div>

      <p className="min-h-4 text-[11px] text-secondary">{message ?? " "}</p>
    </div>
  );
}
