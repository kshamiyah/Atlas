import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { toIsoDateOrNull } from "@/lib/kaizen/kaizen-date";

export async function GET() {
  const { supabase, userId, bypassAuth } = await resolveRequestAuth();

  if (!userId && !bypassAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userId) {
    return NextResponse.json({ entries: [] });
  }

  const { data, error } = await supabase
    .from("kaizen_entries")
    .select("id, title, assessment_type, kaizen_date")
    .eq("user_id", userId)
    .order("synced_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (data ?? [])
    .map(
      (row: {
        id: string;
        title: string | null;
        assessment_type: string | null;
        kaizen_date: string | null;
      }) => {
        const eventDate = toIsoDateOrNull(row.kaizen_date);
        if (!eventDate) return null;

        return {
          id: row.id,
          title: row.title ?? "Untitled entry",
          entryType: row.assessment_type ?? "Entry",
          eventDate,
        };
      },
    )
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));

  return NextResponse.json({ entries });
}
