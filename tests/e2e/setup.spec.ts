import { expect, test } from "@playwright/test";

test.describe("E2E auth setup", () => {
  test("logged-in /dashboard loads via storageState", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /Portfolio Dashboard|Welcome to Atlas/i }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
