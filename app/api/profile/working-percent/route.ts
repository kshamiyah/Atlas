import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import {
  MAX_WORKING_PERCENT,
  MIN_WORKING_PERCENT,
  sanitizeWorkingPercent,
} from "@/lib/profile/ltft";

export async function PATCH(request: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { working_percent?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const numeric =
    typeof body.working_percent === "number"
      ? body.working_percent
      : typeof body.working_percent === "string"
        ? Number.parseInt(body.working_percent, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return NextResponse.json(
      { error: "working_percent must be a number" },
      { status: 400 },
    );
  }

  if (numeric < MIN_WORKING_PERCENT || numeric > MAX_WORKING_PERCENT) {
    return NextResponse.json(
      {
        error: `working_percent must be between ${MIN_WORKING_PERCENT} and ${MAX_WORKING_PERCENT}`,
      },
      { status: 400 },
    );
  }
  const workingPercent = sanitizeWorkingPercent(numeric);

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        working_percent: workingPercent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, working_percent: workingPercent });
}
