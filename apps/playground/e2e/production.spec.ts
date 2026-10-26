import { expect, test } from "@playwright/test";
import { watchConsole } from "./support/console.ts";

const ROUTES = [
  ["/", "Workspace"],
  ["/components", "Components"],
  ["/components/Tabs", "Components"],
  ["/llm-context", "LLM context"],
] as const;

test.describe("PG-18, PG-25: every route of the production build loads by deep link with no console output", () => {
  for (const [path, nav] of ROUTES) {
    test(path, async ({ page }) => {
      const console = watchConsole(page);
      await page.goto(path);
      await expect(
        page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: nav }),
      ).toHaveAttribute("aria-current", "page");
      await page.waitForLoadState("networkidle");
      console.expectClean();
    });
  }

  test("/preview loads standalone and renders from its hash", async ({ page }) => {
    const console = watchConsole(page);
    await page.goto("/preview");
    await expect(page.getByTestId("preview-root")).toBeAttached();
    await expect(page.locator("link[rel=stylesheet][href*='app']")).toHaveCount(0);
    console.expectClean();
  });

  test("client-side navigation keeps the shell", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "LLM context" }).click();
    await expect(page).toHaveURL(/\/llm-context$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});
