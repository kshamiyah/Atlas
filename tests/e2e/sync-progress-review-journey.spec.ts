import { expect, test } from "@playwright/test";

test.describe("Sync -> Progress -> CTA -> Review journey", () => {
  test("opens focused key skill review from Progress descriptor CTA", async ({ page }) => {
    await page.goto("/dashboard/progress?tab=descriptors&descriptor_gaps_only=1");
    await expect(page).not.toHaveURL(/\/login(?:\/|$)/);
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible({
      timeout: 30_000,
    });

    const reviewCta = page.getByRole("link", { name: "Review in My Entries" }).first();
    await expect(reviewCta).toBeVisible({ timeout: 30_000 });

    const href = await reviewCta.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href ?? "").toContain("/dashboard/key-skill-review");
    expect(href ?? "").toContain("focus_cip=");
    expect(href ?? "").toContain("focus_skill=");
    expect(href ?? "").toContain("focus_descriptor=");

    await page.goto(href ?? "/dashboard/key-skill-review");
    await expect(page).toHaveURL(/\/dashboard\/key-skill-review\?/);
    await expect(page.getByText("Focused from Progress")).toBeVisible({
      timeout: 30_000,
    });
  });
});
