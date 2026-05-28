import { callGemini, stripFences } from "@/lib/ai/gemini-client";
import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const FIELD_SYSTEM_PROMPT = `You are an RCOG portfolio writing assistant regenerating ONE field of an existing entry.

Return EXACTLY one JSON object and NOTHING ELSE:
{ "value": "<regenerated field text>" }

No prose. No markdown. No code fences.

ACCURACY (highest priority):
- Use only facts from raw_input and current_fields. Do not invent dates, numbers, grades, investigation results, or procedure names.
- Match the field's role (e.g. what_happened = factual only; reflection = personal insight; action plan = SMART steps from stated gaps only).
- Do not repeat sentences from other fields in current_fields.
- Match tone and approximate length of sibling fields. Be concise; no padding.
- First person for reflective fields. No em dashes. No AI clichés ("closing the loop", "seamless", "genuinely shifted").`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type AuthUser = { id: string };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const supabase = await getServerSupabaseClient();
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
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  let body: {
    entry_type: string;
    field_id: string;
    field_label: string;
    raw_input?: string;
    current_fields?: Record<string, string>;
    length?: "short" | "standard" | "detailed";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!body.entry_type || !body.field_id || !body.field_label) {
    return NextResponse.json(
      { error: "entry_type, field_id, and field_label are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const contextParts: string[] = [];
  contextParts.push(`Entry type: ${body.entry_type}`);
  if (body.raw_input) {
    contextParts.push(`Original narrative: ${body.raw_input}`);
  }
  if (body.current_fields && Object.keys(body.current_fields).length > 0) {
    const otherFields = Object.entries(body.current_fields)
      .filter(([k]) => k !== body.field_id)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    if (otherFields) {
      contextParts.push(`Other fields (for context):\n${otherFields}`);
    }
  }
  contextParts.push(
    `Field to regenerate: "${body.field_label}" (id: ${body.field_id})`,
  );
  contextParts.push(
    `Length target: ${body.length ?? "standard"} (short≈50-120w, standard≈80-200w, detailed≈180-350w). Non-narrative fields should stay brief.`,
  );

  const userMessage = contextParts.join("\n\n");

  try {
    const raw = await callGemini({
      system: FIELD_SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: 800,
      temperature: 0.35,
      jsonObject: true,
    });

    if (!raw) throw new Error("Empty response");

    let parsed: { value: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = JSON.parse(stripFences(raw));
    }

    if (typeof parsed.value !== "string") {
      throw new Error("Missing value in response");
    }

    return NextResponse.json({ value: parsed.value }, { headers: CORS_HEADERS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Field regeneration failed: " + msg },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
