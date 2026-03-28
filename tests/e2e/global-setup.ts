import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const TEST_EMAIL = "e2e-test@portfolioiq.local";

const STORAGE_DIR = path.join(process.cwd(), "tests/e2e/.auth");
const STORAGE_PATH = path.join(STORAGE_DIR, "user.json");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export default async function globalSetup() {
  // Reuse auth state if already created by a previous `test:e2e:setup` run.
  try {
    if (fs.existsSync(STORAGE_PATH) && fs.statSync(STORAGE_PATH).size > 10) {
      return;
    }
  } catch {
    // ignore and re-create
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "http://localhost:3000";

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
    options: {
      redirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) throw new Error(`Failed to generate magic link: ${error.message}`);
  const actionLink = data?.properties?.action_link;
  if (!actionLink) {
    throw new Error("Supabase generateLink did not return an action_link.");
  }

  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Open the magic link directly (avoids relying on an email inbox).
  await page.goto(actionLink, { waitUntil: "networkidle" });

  // Wait until the app has established an authenticated session.
  await page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 });

  await context.storageState({ path: STORAGE_PATH });
  await browser.close();
}
