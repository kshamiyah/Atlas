"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/ThemeProvider";

type AppSidebarProps = {
  userEmail: string | undefined;
  lastSyncAt: string | null;
  /** From `profiles.profile_photo_url` (server); optional localStorage fallback for same-tab UX */
  profilePhotoUrl?: string | null;
};

function sanitizeProfilePhotoUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
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

function SidebarAvatar({
  photoUrl,
  email,
  size,
}: {
  photoUrl: string | null;
  email: string;
  size: "sm" | "md";
}) {
  const initial = email.trim()[0]?.toUpperCase() ?? "?";
  const sizeClass = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const textSize = size === "sm" ? "text-[10px]" : "text-[11px]";
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const normalizedPhotoUrl = photoUrl ?? null;
  const showPhoto =
    Boolean(normalizedPhotoUrl) && failedPhotoUrl !== normalizedPhotoUrl;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-4 ${sizeClass}`}
    >
      {showPhoto && normalizedPhotoUrl ? (
        <img
          src={normalizedPhotoUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailedPhotoUrl(normalizedPhotoUrl)}
        />
      ) : (
        <span className={`font-semibold text-secondary ${textSize}`}>{initial}</span>
      )}
    </div>
  );
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return "Never synced";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Synced";
  return `Synced ${d.toLocaleDateString("en-GB")}`;
}

function syncState(iso: string | null): "fresh" | "stale" | "never" {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const ageDays = (Date.now() - then) / 86_400_000;
  return ageDays <= 7 ? "fresh" : "stale";
}

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    exact: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/dashboard/entries",
    label: "My Entries",
    exact: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v16H4z" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/key-skill-review",
    label: "Review Entries",
    exact: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: "/dashboard/progress",
    label: "Progress",
    exact: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-4 4 4 6-7" />
      </svg>
    ),
  },
  {
    href: "/dashboard/requirements",
    label: "Requirements",
    exact: false,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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

/** Profile lives in the sidebar footer user card on desktop; mobile still needs a chip. */
const PROFILE_NAV_ITEM = {
  href: "/dashboard/profile",
  label: "Profile",
  exact: false,
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
} as const;

const MOBILE_NAV = [...NAV, PROFILE_NAV_ITEM];

const SIDEBAR_EXPAND_COACH_KEY = "piq.sidebar.expand-coach-seen";

export function AppSidebar({
  userEmail,
  lastSyncAt,
  profilePhotoUrl: profilePhotoUrlProp,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const avatarUrl =
    sanitizeProfilePhotoUrl(profilePhotoUrlProp ?? null) ?? localAvatarUrl;

  useEffect(() => {
    function syncFromLocalStorage() {
      try {
        const local = window.localStorage.getItem("piq.profile.photo");
        setLocalAvatarUrl(sanitizeProfilePhotoUrl(local));
      } catch {
        setLocalAvatarUrl(null);
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.key && event.key !== "piq.profile.photo") return;
      syncFromLocalStorage();
    }

    syncFromLocalStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener("piq:profile-photo-updated", syncFromLocalStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "piq:profile-photo-updated",
        syncFromLocalStorage,
      );
    };
  }, []);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showExpandCoach, setShowExpandCoach] = useState(false);
  const userInitiatedCollapseRef = useRef(false);

  useEffect(() => {
    try {
      setIsCollapsed(window.localStorage.getItem("piq.sidebar.collapsed") === "1");
    } catch {
      // no-op
    }
  }, []);

  const dismissExpandCoach = useCallback(() => {
    setShowExpandCoach(false);
    try {
      window.localStorage.setItem(SIDEBAR_EXPAND_COACH_KEY, "1");
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (!isCollapsed) return;
    if (!userInitiatedCollapseRef.current) return;

    userInitiatedCollapseRef.current = false;
    try {
      if (window.localStorage.getItem(SIDEBAR_EXPAND_COACH_KEY) !== "1") {
        setShowExpandCoach(true);
      }
    } catch {
      // no-op
    }
  }, [isCollapsed]);

  const syncStatus = syncState(lastSyncAt);
  const syncText = formatSyncTime(lastSyncAt);
  const isProfileActive = pathname.startsWith("/dashboard/profile");

  function toggleSidebarCollapse() {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (next) {
        userInitiatedCollapseRef.current = true;
      }
      try {
        window.localStorage.setItem("piq.sidebar.collapsed", next ? "1" : "0");
      } catch {
        // no-op
      }
      return next;
    });
  }

  async function signOut() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const sidebarWidth = isCollapsed ? "4.5rem" : "18rem";

  return (
    <>
      <div className="border-b border-subtle bg-surface-2/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-primary shadow-sm">
              <span className="text-micro font-bold" style={{ color: "var(--surface-1)" }}>
                A
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-small font-semibold tracking-tight text-primary">
                Atlas
              </p>
              {userEmail && (
                <p className="truncate text-[11px] text-muted">{userEmail}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
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
            <button
              type="button"
              onClick={signOut}
              className="rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:bg-surface-3 hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {MOBILE_NAV.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-accent-primary bg-accent-primary text-surface-1"
                    : "border-subtle bg-surface-1 text-secondary hover:bg-surface-3 hover:text-primary",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <aside
        className={[
          "relative z-20 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-subtle bg-surface-2/85 backdrop-blur md:flex",
        ].join(" ")}
        style={{
          width: sidebarWidth,
          transition:
            "width 360ms cubic-bezier(0.22, 1, 0.36, 1), border-color 260ms ease, background-color 260ms ease",
        }}
      >
        <div
          className={[
            "border-b border-subtle transition-all duration-300 ease-in-out",
            isCollapsed ? "px-2 py-3" : "space-y-2 px-4 py-4",
          ].join(" ")}
        >
          <div
            className={[
              "flex min-w-0 items-center",
              isCollapsed ? "justify-center" : "justify-between gap-2",
            ].join(" ")}
          >
            {isCollapsed ? (
              <button
                type="button"
                onClick={() => {
                  dismissExpandCoach();
                  toggleSidebarCollapse();
                }}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-transparent px-1 py-1.5 transition hover:border-subtle hover:bg-surface-3/80 focus:outline-none focus:ring-2 focus:ring-accent-primary/35 focus:ring-offset-2 focus:ring-offset-surface-2"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-primary shadow-sm">
                  <span className="text-micro font-bold" style={{ color: "var(--surface-1)" }}>
                    A
                  </span>
                </div>
                <span className="flex items-center gap-0.5 text-[10px] font-medium text-muted">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Expand
                </span>
              </button>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-primary shadow-sm">
                    <span className="text-micro font-bold" style={{ color: "var(--surface-1)" }}>
                      A
                    </span>
                  </div>
                  <span className="truncate text-sm font-semibold tracking-tight text-primary">
                    Atlas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleSidebarCollapse}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-primary"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              </>
            )}
          </div>
          {isCollapsed && showExpandCoach ? (
            <div
              className="mt-2 animate-fade-up rounded-lg border border-accent-blue/25 bg-accent-blue/10 px-2 py-2 text-center"
              role="status"
            >
              <p className="text-[10px] leading-snug text-secondary">
                Click Expand to open the sidebar again.
              </p>
              <button
                type="button"
                onClick={dismissExpandCoach}
                className="mt-1.5 text-[10px] font-semibold text-accent-blue hover:underline"
              >
                Got it
              </button>
            </div>
          ) : null}
          {!isCollapsed ? (
            <p className="text-[11px] leading-snug text-muted">
              Track evidence coverage, review skills, and write entries faster.
            </p>
          ) : null}
        </div>

        <nav
          className={[
            "flex-1 space-y-1 transition-all duration-300 ease-in-out",
            isCollapsed ? "px-2 py-3" : "px-3 py-4",
          ].join(" ")}
        >
          <p
            className={[
              "overflow-hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted transition-all duration-300 ease-in-out",
              isCollapsed
                ? "max-h-0 -translate-y-1 opacity-0"
                : "max-h-8 translate-y-0 opacity-100",
            ].join(" ")}
          >
            Workspace
          </p>
          {NAV.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={[
                  "flex items-center rounded-xl border text-small transition-all duration-300 ease-in-out",
                  isCollapsed
                    ? "mx-auto h-10 w-10 justify-center p-0"
                    : "gap-3 px-3.5 py-2.5",
                  isActive
                    ? "border-accent-primary bg-accent-primary text-surface-1 shadow-sm"
                    : "border-transparent text-secondary hover:border-subtle hover:bg-surface-3 hover:text-primary",
                ].join(" ")}
              >
                <span className={isActive ? "text-surface-1" : "text-muted"}>
                  {item.icon}
                </span>
                <span
                  className={[
                    "inline-block overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out",
                    isCollapsed
                      ? "max-w-0 -translate-x-1 opacity-0"
                      : "max-w-[150px] translate-x-0 opacity-100",
                  ].join(" ")}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div
          className={[
            "space-y-2 border-t border-subtle transition-all duration-300 ease-in-out",
            isCollapsed ? "px-2 py-3" : "px-3 py-3",
          ].join(" ")}
        >
          {userEmail && (
            <>
              <div
                className={[
                  "overflow-hidden transition-all duration-300 ease-in-out",
                  isCollapsed
                    ? "max-h-0 -translate-y-1 opacity-0"
                    : "max-h-24 translate-y-0 opacity-100",
                ].join(" ")}
              >
                <Link
                  href="/dashboard/profile"
                  title="Profile"
                  aria-label="Profile and account settings"
                  aria-current={isProfileActive ? "page" : undefined}
                  className={[
                    "block rounded-xl border border-subtle bg-surface-1 p-3 transition-colors",
                    isProfileActive
                      ? "border-accent-primary shadow-sm ring-1 ring-accent-primary/30"
                      : "hover:border-subtle hover:bg-surface-3",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <SidebarAvatar photoUrl={avatarUrl} email={userEmail} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-micro text-secondary">
                        {userEmail}
                      </p>
                      <p className="truncate text-[10px] text-muted">
                        {syncText}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
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
                    </div>
                  </div>
                </Link>
              </div>

              <div
                className={[
                  "overflow-hidden transition-all duration-300 ease-in-out",
                  isCollapsed
                    ? "max-h-12 translate-y-0 opacity-100"
                    : "max-h-0 -translate-y-1 opacity-0",
                ].join(" ")}
              >
                <div className="flex justify-center">
                  <Link
                    href="/dashboard/profile"
                    title={`Profile • ${userEmail} • ${syncText}`}
                    aria-label="Profile and account settings"
                    aria-current={isProfileActive ? "page" : undefined}
                    className={[
                      "overflow-hidden rounded-full transition-colors",
                      isProfileActive
                        ? "ring-2 ring-accent-primary ring-offset-2 ring-offset-surface-2"
                        : "hover:ring-1 hover:ring-subtle",
                    ].join(" ")}
                  >
                    <SidebarAvatar photoUrl={avatarUrl} email={userEmail} size="md" />
                  </Link>
                </div>
              </div>
            </>
          )}

          <div className={`flex items-center px-1 ${isCollapsed ? "justify-center gap-2" : "justify-between"}`}>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className={`transition-colors hover:text-primary ${isCollapsed ? "rounded-md p-1.5 text-muted hover:bg-surface-3" : "text-micro text-muted"}`}
            >
              {isCollapsed ? (
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
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              ) : (
                "Sign out"
              )}
            </button>
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
    </>
  );
}
