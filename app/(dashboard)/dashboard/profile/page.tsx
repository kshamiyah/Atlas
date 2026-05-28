import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";
import { ProfilePhotoEditor } from "@/components/profile/ProfilePhotoEditor";
import { WorkingPatternEditor } from "@/components/profile/WorkingPatternEditor";
import { sanitizeWorkingPercent } from "@/lib/profile/ltft";

type StageRow = {
  id: string;
  name: string;
};

type ProfilePost = {
  grade: string;
  post_start: string | null;
  post_end: string | null;
  hospital: string | null;
  trust: string | null;
};

type ProfileRow = {
  full_name: string | null;
  rcog_number: string | null;
  gmc_number: string | null;
  ntn: string | null;
  current_grade: string | null;
  current_stage_id: string | null;
  arcp_date: string | null;
  working_percent: number | null;
  hospital: string | null;
  trust: string | null;
  profile_photo_url: string | null;
  post_history: unknown;
  updated_at: string | null;
};

function isMissingColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { message?: string; details?: string };
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return haystack.includes("does not exist") && haystack.includes(columnName.toLowerCase());
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not available";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(dateValue: string | null): number | null {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((target.getTime() - nowMidnight.getTime()) / 86_400_000);
}

function parsePostHistory(value: unknown): ProfilePost[] {
  if (!Array.isArray(value)) return [];
  const parsed = value
    .map((row): ProfilePost | null => {
      if (!row || typeof row !== "object") return null;
      const obj = row as Record<string, unknown>;
      const grade = toText(obj.grade);
      if (!grade) return null;
      return {
        grade,
        post_start: toText(obj.post_start),
        post_end: toText(obj.post_end),
        hospital: toText(obj.hospital),
        trust: toText(obj.trust),
      };
    })
    .filter((row): row is ProfilePost => row !== null);

  return parsed.sort((a, b) =>
    String(b.post_start ?? "").localeCompare(String(a.post_start ?? "")),
  );
}

function infoRow(label: string, value: string) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-subtle py-3 last:border-b-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-small font-medium text-primary text-right">{value}</span>
    </div>
  );
}

function placementLabel(post: ProfilePost | null): string {
  if (!post) return "Not set";
  const hospital = post.hospital ?? "Unknown hospital";
  const trust = post.trust ?? "Unknown trust";
  return `${hospital} · ${trust}`;
}

export default async function ProfilePage() {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !bypassAuth) redirect("/login");

  const [{ data: stages }, { data: syncRows }] = await Promise.all([
    supabase.from("stages").select("id, name").order("sort_order", { ascending: true }),
    user
      ? supabase
          .from("kaizen_sync_log")
          .select("sync_type, synced_at")
          .eq("user_id", user.id)
          .order("synced_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as { sync_type: string; synced_at: string }[] }),
  ]);

  let profile: ProfileRow | null = null;
  if (user) {
    const fullSelect =
      "full_name, rcog_number, gmc_number, ntn, current_grade, current_stage_id, arcp_date, working_percent, hospital, trust, profile_photo_url, post_history, updated_at";
    const fallbackSelect = "full_name, current_stage_id, arcp_date, hospital, updated_at";

    const firstLoad = await supabase
      .from("profiles")
      .select(fullSelect)
      .eq("id", user.id)
      .maybeSingle();

    if (
      firstLoad.error &&
      (isMissingColumn(firstLoad.error, "post_history") ||
        isMissingColumn(firstLoad.error, "profile_photo_url") ||
        isMissingColumn(firstLoad.error, "working_percent"))
    ) {
      const fallbackLoad = await supabase
        .from("profiles")
        .select(fallbackSelect)
        .eq("id", user.id)
        .maybeSingle();
      profile = fallbackLoad.data
        ? ({
            ...fallbackLoad.data,
            rcog_number: null,
            gmc_number: null,
            ntn: null,
            current_grade: null,
            working_percent: 100,
            trust: null,
            profile_photo_url: null,
            post_history: [],
          } as ProfileRow)
        : null;
    } else {
      profile = (firstLoad.data as ProfileRow | null) ?? null;
    }
  }

  const stageById = new Map<string, StageRow>((stages ?? []).map((s) => [s.id, s as StageRow]));
  const stageName =
    profile?.current_grade ??
    (profile?.current_stage_id ? stageById.get(profile.current_stage_id)?.name ?? null : null);

  const posts = parsePostHistory(profile?.post_history ?? []);
  const currentPost = posts[0] ?? null;
  const lastSync = (syncRows ?? [])[0]?.synced_at ?? null;
  const lastProfileSync =
    (syncRows ?? []).find((row) => row.sync_type === "profile")?.synced_at ?? null;
  const arcpDays = daysUntil(profile?.arcp_date ?? null);
  const workingPercent = sanitizeWorkingPercent(profile?.working_percent ?? 100);
  const workingPatternLabel =
    workingPercent >= 100 ? "Full-time (100%)" : `LTFT (${workingPercent}% WTE)`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <div className="space-y-4">
        <header className="rounded-2xl border border-subtle bg-surface-2 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Profile</p>
              <h1 className="text-heading-3 font-semibold text-primary">
                {profile?.full_name ?? "Your Profile"}
              </h1>
            </div>
            <Link href="/dashboard" className="btn-secondary">
              Back
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-subtle bg-surface-2 px-5 py-4">
          <h2 className="text-small font-semibold text-primary">Photo</h2>
          <div className="pt-3">
            <ProfilePhotoEditor
              initialPhotoUrl={profile?.profile_photo_url ?? null}
              displayName={profile?.full_name ?? null}
              allowSave={Boolean(user)}
              embedded
            />
          </div>
        </section>

        <section className="rounded-2xl border border-subtle bg-surface-2 px-5 py-2">
          <h2 className="pt-2 text-small font-semibold text-primary">Working Pattern</h2>
          {infoRow("Current setting", workingPatternLabel)}
          <div className="pb-3 pt-2">
            <WorkingPatternEditor initialWorkingPercent={workingPercent} />
          </div>
        </section>

        <section className="rounded-2xl border border-subtle bg-surface-2 px-5 py-2">
          <h2 className="pt-2 text-small font-semibold text-primary">Training</h2>
          <p className="pb-2 text-[11px] leading-relaxed text-muted">
            Current stage is synced from your ePortfolio profile. Update it in ePortfolio, then run a
            profile sync from the extension.
          </p>
          {infoRow("Current stage", stageName ?? "Not set")}
          {infoRow("Current placement", placementLabel(currentPost))}
          {infoRow("ARCP date", formatDate(profile?.arcp_date ?? null))}
          {infoRow(
            "ARCP countdown",
            arcpDays == null ? "Not available" : arcpDays > 0 ? `${arcpDays} days` : "Date passed",
          )}
          {infoRow("Last profile sync", formatDateTime(lastProfileSync))}
          {infoRow("Last any sync", formatDateTime(lastSync))}
        </section>

        <section className="rounded-2xl border border-subtle bg-surface-2 px-5 py-2">
          <h2 className="pt-2 text-small font-semibold text-primary">Identifiers</h2>
          {infoRow("RCOG Number", profile?.rcog_number ?? "Not available")}
          {infoRow("GMC Number", profile?.gmc_number ?? "Not available")}
          {infoRow("NTN", profile?.ntn ?? "Not available")}
        </section>

        <section className="rounded-2xl border border-subtle bg-surface-2 px-5 py-2">
          <div className="flex items-center justify-between gap-2 py-2">
            <h2 className="text-small font-semibold text-primary">Post History</h2>
            <span className="text-xs text-secondary">{posts.length} posts</span>
          </div>
          {posts.length === 0 ? (
            <p className="pb-4 text-small text-secondary">
              No posts synced yet. Run ePortfolio sync from the extension.
            </p>
          ) : (
            <div className="pb-1">
              {posts.map((post, idx) => (
                <div
                  key={`${post.grade}-${post.post_start ?? idx}`}
                  className="border-b border-subtle py-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-small font-medium text-primary">{post.grade}</span>
                    <span className="text-xs text-secondary">
                      {formatDate(post.post_start)} - {formatDate(post.post_end)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-secondary">
                    {(post.hospital ?? "Unknown hospital")} · {(post.trust ?? "Unknown trust")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
