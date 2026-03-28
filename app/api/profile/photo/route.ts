import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

function isMissingColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { message?: string; details?: string };
  const haystack = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return haystack.includes("does not exist") && haystack.includes(columnName.toLowerCase());
}

function sanitizePhotoUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
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

export async function PATCH(req: Request) {
  const supabase = await getServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { photo_url?: unknown };
  try {
    body = (await req.json()) as { photo_url?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const photoUrl = sanitizePhotoUrl(body.photo_url);
  if (body.photo_url != null && !photoUrl) {
    return NextResponse.json(
      { error: "photo_url must be http(s) URL or data:image/* value" },
      { status: 400 },
    );
  }
  if (photoUrl && photoUrl.length > 900_000) {
    return NextResponse.json(
      { error: "photo_url is too large; choose a smaller image" },
      { status: 413 },
    );
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        profile_photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    if (isMissingColumn(error, "profile_photo_url")) {
      return NextResponse.json(
        { error: "profile_photo_url column missing; run migration 0017_profile_photo_url.sql" },
        { status: 412 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile_photo_url: photoUrl });
}
