"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/ThemeProvider";

type AppSidebarProps = {
  userEmail: string | undefined;
  lastSyncAt: string | null;
};

function formatSyncTime(iso: string | null): string {
  if (!iso) return "Never synced";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const NAV = [
  {
    href: "/dashboard",
    label: "Home",
    exact: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/dashboard/key-skill-review",
    label: "My Entries",
    exact: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: "/dashboard/gap-report",
    label: "Progress by CiP",
    exact: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    href: "/dashboard/generate",
    label: "Write an Entry",
    exact: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function AppSidebar({ userEmail, lastSyncAt }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const syncAge = lastSyncAt ? Date.now() - new Date(lastSyncAt).getTime() : null;
  const syncStatus = syncAge === null ? "never" : syncAge > STALE_MS ? "stale" : "fresh";

  async function signOut() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-surface-1 shadow-[1px_0_0_0_var(--border-subtle)]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary">
          <span className="text-micro font-bold" style={{ color: "var(--surface-1)" }}>P</span>
        </div>
        <span className="text-small font-bold tracking-tight text-primary">
          PortfolioIQ
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        <p className="mb-1 px-3 text-micro font-semibold uppercase tracking-widest text-muted">
          Menu
        </p>
        {NAV.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2 text-small transition-colors",
                isActive
                  ? "bg-accent-primary/[0.10] text-primary font-medium"
                  : "text-secondary hover:bg-surface-3 hover:text-primary",
              ].join(" ")}
            >
              <span className={isActive ? "text-accent-primary" : "text-muted"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-subtle px-3 py-3 space-y-2">
        {/* User card */}
        {userEmail && (
          <div className="flex items-center gap-2.5 rounded-lg bg-surface-3 px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-primary/15">
              <span className="text-micro font-semibold text-accent-primary">
                {userEmail[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-micro font-medium text-primary">
                {userEmail}
              </p>
              <div className="flex items-center gap-1.5">
                {syncStatus === "fresh" && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse-dot"
                    style={{ backgroundColor: "var(--accent-green)" }}
                  />
                )}
                {syncStatus === "stale" && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--accent-amber)" }}
                  />
                )}
                <p className="text-micro text-muted">
                  {formatSyncTime(lastSyncAt)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={signOut}
            className="text-micro text-muted transition-colors hover:text-primary"
          >
            Sign out
          </button>
          {/* Dark mode toggle */}
          <button
            type="button"
            onClick={toggle}
            aria-label={
              theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-primary"
          >
            {theme === "dark" ? (
              /* Sun icon */
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              /* Moon icon */
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
