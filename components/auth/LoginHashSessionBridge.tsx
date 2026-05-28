"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

type LoginHashSessionBridgeProps = {
  onProcessingChange?: (processing: boolean) => void;
  onError?: (message: string | null) => void;
};

function readHashErrorMessage(hash: URLSearchParams): string | null {
  const error = hash.get("error");
  if (!error) return null;

  const description = hash.get("error_description")?.replace(/\+/g, " ").trim();
  if (description) return description;

  if (error === "access_denied") {
    return "This sign-in link has expired or was already used. Request a new magic link below.";
  }

  return "We couldn't complete sign-in from this link. Request a new magic link below.";
}

export function LoginHashSessionBridge({
  onProcessingChange,
  onError,
}: LoginHashSessionBridgeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!rawHash) return;

    const hash = new URLSearchParams(rawHash);
    const hashError = readHashErrorMessage(hash);
    if (hashError) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      onError?.(hashError);
      onProcessingChange?.(false);
      return;
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    const access = accessToken;
    const refresh = refreshToken;
    let cancelled = false;

    onProcessingChange?.(true);
    onError?.(null);

    async function consumeHashSession() {
      try {
        const supabase = getBrowserSupabaseClient();
        const { error } = await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });

        if (cancelled) return;

        if (error) {
          onProcessingChange?.(false);
          onError?.(
            error.message ||
              "We couldn't finish signing you in. Request a new magic link below.",
          );
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + window.location.search,
          );
          return;
        }

        const source = searchParams.get("source");
        const requestedNext =
          searchParams.get("redirectTo") ?? searchParams.get("next");
        const safeNext =
          requestedNext && requestedNext.startsWith("/")
            ? requestedNext
            : "/dashboard";
        const target = source === "extension" ? "/auth/extension-done" : safeNext;
        window.history.replaceState({}, document.title, "/login");
        router.replace(target);
      } catch {
        if (cancelled) return;
        onProcessingChange?.(false);
        onError?.(
          "Something went wrong while signing you in. Request a new magic link below.",
        );
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.search,
        );
      }
    }

    void consumeHashSession();
    return () => {
      cancelled = true;
      onProcessingChange?.(false);
    };
  }, [router, searchParams, onError, onProcessingChange]);

  return null;
}
