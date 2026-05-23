"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginHashSessionBridge() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!rawHash) return;

    const hash = new URLSearchParams(rawHash);
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) return;
    const access = accessToken;
    const refresh = refreshToken;

    let cancelled = false;

    async function consumeHashSession() {
      try {
        const supabase = getBrowserSupabaseClient();
        const { error } = await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });
        if (error || cancelled) return;

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
        // no-op: fallback stays on login where user can request a new link
      }
    }

    void consumeHashSession();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return null;
}
