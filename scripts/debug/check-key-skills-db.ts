import { createServiceRoleSupabaseClient } from "@/lib/supabase/admin";

async function main() {
  const supabase = createServiceRoleSupabaseClient();

  const { data: keySkillRows, error } = await supabase
    .from("key_skills")
    .select("legacy_id, title, cips ( number, title ), descriptors ( text, sort_order )")
    .not("legacy_id", "is", null);

  if (error) {
    console.error("query error:", error.message);
    return;
  }

  console.log("key_skills with legacy_id:", keySkillRows?.length ?? 0);
  if (keySkillRows && keySkillRows.length > 0) {
    console.log("sample:", keySkillRows.slice(0, 3).map((r) => ({
      legacy_id: r.legacy_id,
      title: r.title,
      descriptors: Array.isArray(r.descriptors) ? r.descriptors.length : 0,
    })));
  }
}

void main();
