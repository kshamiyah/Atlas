"use client";

import { useEffect, useState } from "react";

/**
 * Shown after extension flow login. Extension content script on this page
 * fetches /api/auth/session and stores the token in chrome.storage.
 * This page just tells the user to close the tab.
 */
export default function ExtensionDonePage() {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          Connected to PortfolioIQ
        </h1>
        <p className="text-sm text-slate-300">
          You can close this tab and return to the extension. Sync your data from
          the Kaizen dashboard using the extension buttons.
        </p>
        <p className="text-xs text-slate-500">
          If the extension did not receive the token, reopen the extension popup
          and try &quot;Connect to PortfolioIQ&quot; again.
        </p>
      </div>
    </main>
  );
}
