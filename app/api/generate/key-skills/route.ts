import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type AuthUser = { id: string };
type KeySkillRow = {
  legacy_id: string | null;
  title: string | null;
  cips:
    | {
        number: number | null;
      }
    | Array<{
        number: number | null;
      }>
    | null;
};
type CoverageRow = {
  key_skill_name: string | null;
  evidence_count: number | null;
  covered: boolean | null;
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const supabase = await getServerSupabaseClient();
  const bypassAuth = isDevAuthBypassEnabled();

  let user: AuthUser | null = null;
  const authHeader = request.headers.get("Authorization");

  // Prefer explicit Bearer auth from the extension; fall back to cookie auth.
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    try {
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } catch {
      user = null;
    }
  }

  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user && !bypassAuth) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS }
    );
  }
  if (!user && bypassAuth) {
    return NextResponse.json({ skills: [] }, { headers: CORS_HEADERS });
  }
  if (!user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS }
    );
  }
  const userId = user.id;

  const { data: keySkillRows } = await supabase
    .from("key_skills")
    .select("legacy_id, title, cips ( number )");

  const { data: coverageRows } = await supabase
    .from("kaizen_key_skill_coverage")
    .select("key_skill_name, evidence_count, covered, cip_number")
    .eq("user_id", userId);

  const typedCoverageRows = (coverageRows ?? []) as CoverageRow[];
  const typedKeySkillRows = (keySkillRows ?? []) as KeySkillRow[];

  const coverageByTitle = new Map(
    typedCoverageRows.map((c) => [
      String(c.key_skill_name ?? "").toLowerCase().trim(),
      c,
    ])
  );

  const skills = typedKeySkillRows
    .filter(
      (ks): ks is KeySkillRow & { legacy_id: string; title: string } =>
        Boolean(ks.legacy_id && ks.title)
    )
    .map((ks) => {
      const coverage = coverageByTitle.get(
        String(ks.title).toLowerCase().trim()
      );
      const cip = Array.isArray(ks.cips) ? (ks.cips[0] ?? null) : ks.cips;
      return {
        key_skill_id: ks.legacy_id,
        title: ks.title,
        cip_number: cip?.number ?? null,
        covered: coverage?.covered ?? null,
        evidence_count: coverage?.evidence_count ?? null,
      };
    })
    // Sort: CiP number ascending, alphabetical within CiP
    .sort((a, b) => {
      const cipA = a.cip_number ?? 999;
      const cipB = b.cip_number ?? 999;
      if (cipA !== cipB) return cipA - cipB;
      return a.title.localeCompare(b.title);
    });

  return NextResponse.json({ skills }, { headers: CORS_HEADERS });
}
