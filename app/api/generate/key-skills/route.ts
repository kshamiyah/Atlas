import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: keySkillRows } = await supabase
    .from("key_skills")
    .select("legacy_id, title, cips ( number )");

  const { data: coverageRows } = await supabase
    .from("kaizen_key_skill_coverage")
    .select("key_skill_name, evidence_count, covered, cip_number")
    .eq("user_id", user.id);

  const coverageByTitle = new Map(
    (coverageRows ?? []).map((c) => [
      String((c as any).key_skill_name ?? "").toLowerCase().trim(),
      c,
    ])
  );

  const skills = (keySkillRows ?? [])
    .filter((ks) => (ks as any).legacy_id && (ks as any).title)
    .map((ks) => {
      const coverage = coverageByTitle.get(
        String((ks as any).title ?? "").toLowerCase().trim()
      );
      return {
        key_skill_id: (ks as any).legacy_id as string,
        title: (ks as any).title as string,
        cip_number: (ks as any).cips?.number ?? null,
        covered: (coverage as any)?.covered ?? null,
        evidence_count: (coverage as any)?.evidence_count ?? null,
      };
    })
    // Sort: CiP number ascending, alphabetical within CiP
    .sort((a, b) => {
      const cipA = a.cip_number ?? 999;
      const cipB = b.cip_number ?? 999;
      if (cipA !== cipB) return cipA - cipB;
      return a.title.localeCompare(b.title);
    });

  return NextResponse.json({ skills });
}
