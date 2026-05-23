import { callGemini, stripFences } from "@/lib/ai/gemini-client";
import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const FIELD_SYSTEM_PROMPT = `You are an expert RCOG portfolio writing assistant. Given an existing portfolio entry and a specific field that needs to be regenerated, produce a fresh, high-quality replacement for that single field.

Return EXACTLY one JSON object and NOTHING ELSE:
{ "value": "<regenerated field text>" }

No prose. No markdown. No code fences. Your entire response must be parseable by JSON.parse() with no pre-processing.

Rules:
- Match the style, tone and length of the other fields in the entry.
- Ensure clinical accuracy — do not invent details not present in the original narrative or existing fields.
- Do not repeat verbatim sentences from other fields.
- Keep the same entry_type conventions (e.g. first-person for reflection, concise for procedure).`;

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
