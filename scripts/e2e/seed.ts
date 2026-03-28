import { createClient } from "@supabase/supabase-js";

const TEST_EMAIL = "e2e-test@portfolioiq.local";
const AUTH_PROFILE_STAGE_NAME = "ST1";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function ensureTestUser(supabase: unknown) {
  type SeedAuthUser = { id: string; email: string | null };

  type SeedSupabaseClient = {
    auth: {
      admin: {
        listUsers: (args: { page: number; perPage: number }) => Promise<{
          data: { users: SeedAuthUser[] } | null;
          error: { message: string } | null;
        }>;
        createUser: (args: { email: string; email_confirm: boolean }) => Promise<{
          data: SeedAuthUser | null;
          error: { message: string } | null;
        }>;
      };
    };
  };

  const client = supabase as SeedSupabaseClient;

  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) throw new Error(`Failed to list users: ${error.message}`);
  const existing = (data?.users ?? []).find(
    (u) => String(u.email ?? "").toLowerCase() === TEST_EMAIL.toLowerCase(),
  );
  if (existing) return existing;

  const { data: created, error: createErr } =
    await client.auth.admin.createUser({
      email: TEST_EMAIL,
      email_confirm: true,
    });

  if (createErr) throw new Error(`Failed to create test user: ${createErr.message}`);
  if (!created) throw new Error("Failed to create test user (no data returned).");
  return created;
}

export async function seedE2E() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceRoleKey);

  const user = await ensureTestUser(supabase);
  const userId = user.id;

  // 1) Upsert profile row (for dashboard + readiness).
  const { data: stages } = await supabase
    .from("stages")
    .select("id,name,sort_order")
    .order("sort_order", { ascending: true });
  const st =
    (stages ?? []).find((s) => s.name === AUTH_PROFILE_STAGE_NAME) ??
    (stages ?? [])[0] ??
    null;
  if (!st) throw new Error("Could not resolve a stage row for seed profile.");

  const today = new Date();
  const arcpDate = ymd(new Date(today.getTime() + 1000 * 60 * 60 * 24 * 60)); // +60 days

  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      current_stage_id: st.id,
      current_grade: "E2E",
      arcp_date: arcpDate,
      working_percent: 100,
      post_history: [],
    },
    { onConflict: "id" },
  );
  if (profileErr) throw new Error(`Failed to upsert profiles row: ${profileErr.message}`);

  // 2) Clear/reseed ONLY e2e user-scoped review tables.
  const toDelete = [
    "key_skill_descriptor_coverage",
    "key_skill_review_suggestions",
    "key_skill_review_entries",
  ] as const;
  for (const tbl of toDelete) {
    const { error } = await supabase.from(tbl).delete().eq("user_id", userId);
    if (error) throw new Error(`Failed to clear ${tbl}: ${error.message}`);
  }

  // 3) Choose deterministic curriculum slice.
  const { data: cips } = await supabase
    .from("cips")
    .select("id,number,title")
    .order("number", { ascending: true });

  if (!cips || cips.length === 0) throw new Error("No CiPs found in curriculum.");
  const cip = cips[0];
  const cipNumber = Number(cip.number);

  const { data: keySkills } = await supabase
    .from("key_skills")
    .select("id,title,skill_number,cip_id")
    .eq("cip_id", cip.id)
    .order("skill_number", { ascending: true });

  const ksRows = (keySkills ?? []).slice(0, 6); // keep seeded dataset small + deterministic
  if (ksRows.length === 0) throw new Error("No key skills found for chosen CiP.");

  // 4) Insert one deterministic review entry.
  const entryEventDate = "2026-03-20";
  const sourceEntryKey = "e2e-review-entry-1";
  const { data: entryIns, error: entryErr } = await supabase
    .from("key_skill_review_entries")
    .insert({
      user_id: userId,
      source_system: "generated",
      source_entry_key: sourceEntryKey,
      title: "E2E seeded review entry",
      entry_type: "e2e",
      linked_cip_number: cipNumber,
      event_date: entryEventDate,
      entry_text: "This entry is seeded for deterministic Playwright E2E tests.",
      stage_id: st.id,
      metadata: {},
      // Keep ordering deterministic.
      last_seen_at: `${entryEventDate}T12:00:00Z`,
    })
    .select("id")
    .single();

  if (entryErr) throw new Error(`Failed to insert key_skill_review_entries: ${entryErr.message}`);
  const entryId = entryIns.id as string;

  // 5) Insert deterministic confirmed key-skill suggestions.
  const suggestionRows = ksRows.map((ks) => ({
    user_id: userId,
    review_entry_id: entryId,
    key_skill_id: ks.id,
    suggestion_source: "linked_cip",
    method: "rule",
    status: "confirmed",
    confidence: 0.9,
    rationale: `Seeded confirmed key-skill for ${String(ks.title ?? "").trim()}`,
  }));

  const { error: sugErr } = await supabase
    .from("key_skill_review_suggestions")
    .upsert(suggestionRows, {
      onConflict: "review_entry_id,key_skill_id,suggestion_source",
    });
  if (sugErr) throw new Error(`Failed to insert key_skill_review_suggestions: ${sugErr.message}`);

  // 6) Insert deterministic descriptor coverage rows for those key skills.
  const coverageRows: Array<{
    user_id: string;
    review_entry_id: string;
    key_skill_id: string;
    descriptor_id: string;
    covered: boolean;
    confidence: number | null;
    evidence_quote: string | null;
    method: "ai" | "user";
  }> = [];

  for (const ks of ksRows) {
    const { data: descriptors } = await supabase
      .from("descriptors")
      .select("id,sort_order")
      .eq("key_skill_id", ks.id)
      .order("sort_order", { ascending: true });

    const descList = descriptors ?? [];
    if (descList.length === 0) continue;

    for (let i = 0; i < descList.length; i++) {
      const d = descList[i];
      const covered = i === 0;
      coverageRows.push({
        user_id: userId,
        review_entry_id: entryId,
        key_skill_id: ks.id,
        descriptor_id: d.id,
        covered,
        confidence: covered ? 0.85 : 0.2,
        evidence_quote: covered
          ? `E2E evidence quote for ${String(ks.title ?? "").trim()} / descriptor ${d.id}`
          : null,
        method: "ai",
      });
    }
  }

  if (coverageRows.length === 0) {
    throw new Error("Seed produced zero coverage rows; aborting.");
  }

  const { error: covErr } = await supabase
    .from("key_skill_descriptor_coverage")
    .upsert(coverageRows, {
      onConflict: "user_id,review_entry_id,key_skill_id,descriptor_id",
    });
  if (covErr) throw new Error(`Failed to insert key_skill_descriptor_coverage: ${covErr.message}`);

  // Deterministic done message for CI logs.
  console.log(
    JSON.stringify({
      ok: true,
      userId,
      seeded: {
        entryId,
        cipNumber,
        keySkills: ksRows.length,
        coverageRows: coverageRows.length,
      },
    }),
  );
}

// Execute on direct runs (npm scripts call this file directly).
seedE2E().catch((err) => {
  console.error("[e2e seed] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

