import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
};

async function expectNoCriticalViolations(pagePath: string, page: Page) {
  await page.goto(pagePath);
  await expect(page).not.toHaveURL(/\/login(?:\/|$)/);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const blocking = (results.violations as AxeViolation[]).filter(
    (v) => v.impact === "critical",
  );

  const summary = blocking
    .map((v) => {
      const firstTarget = v.nodes[0]?.target?.join(" > ") ?? "unknown target";
      return `${v.id}: ${v.help} (${firstTarget})`;
    })
    .join("\n");

  expect(blocking, summary || "Critical accessibility violations found").toEqual([]);
}

test.describe("Accessibility (axe)", () => {
  test("dashboard has no critical violations", async ({ page }) => {
    await expectNoCriticalViolations("/dashboard", page);
  });

  test("progress has no critical violations", async ({ page }) => {
    await expectNoCriticalViolations("/dashboard/progress?tab=descriptors", page);
  });

  test("key-skill-review has no critical violations", async ({ page }) => {
    await expectNoCriticalViolations("/dashboard/key-skill-review?focus_cip=1", page);
  });
});
