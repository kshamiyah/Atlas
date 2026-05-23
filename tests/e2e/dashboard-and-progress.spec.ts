import { expect, test } from "@playwright/test";

test.describe("Dashboard + Progress hub (seeded auth)", () => {
  test("dashboard loads command centre", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login(?:\/|$)/);
    await expect(page.getByRole("heading", { name: /Portfolio Dashboard|Welcome to Atlas/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("progress hub loads and tab query selects descriptors", async ({ page }) => {
    await page.goto("/dashboard/progress?tab=descriptors");
    await expect(page).not.toHaveURL(/\/login(?:\/|$)/);
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tab", { name: /descriptors/i })).toHaveAttribute("aria-selected", "true");
  });

  test("key skill review shows Progress focus banner when focus_cip present", async ({ page }) => {
    await page.goto("/dashboard/key-skill-review?focus_cip=1");
    await expect(page).not.toHaveURL(/\/login(?:\/|$)/);
    await expect(page.getByRole("heading", { name: /Key skill review/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Focused from Progress")).toBeVisible({ timeout: 30_000 });
  });
});
