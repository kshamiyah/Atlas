import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

type CoverageResponse = {
  total: number;
  confirmed: number;
  rejected: number;
  suggested: number;
  crossPending: number;
};

export async function GET() {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 500 },
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("key_skill_review_suggestions")
    .select("status, suggestion_source", { count: "exact", head: false })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load coverage: " + error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as Array<{
    status: "suggested" | "confirmed" | "rejected";
    suggestion_source: "linked_cip" | "cross_cip";
  }>;

  let total = 0;
  let confirmed = 0;
  let rejected = 0;
  let suggested = 0;
  let crossPending = 0;

  for (const row of rows) {
    total += 1;
    if (row.status === "confirmed") confirmed += 1;
    if (row.status === "rejected") rejected += 1;
    if (row.status === "suggested") {
      suggested += 1;
      if (row.suggestion_source === "cross_cip") crossPending += 1;
    }
  }

  const body: CoverageResponse = {
    total,
    confirmed,
    rejected,
    suggested,
    crossPending,
  };

  return NextResponse.json(body);
}

