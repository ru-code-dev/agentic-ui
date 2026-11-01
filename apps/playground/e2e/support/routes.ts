import { expect, type Page } from "@playwright/test";
import { openAgent } from "./agent.ts";
import { CONTRACT_COMPONENTS } from "./contract.ts";
import { openWorkspace } from "./workspace.ts";

/** Every playground route with an opener that waits until the page has rendered (PG-19 checks). */
export const ROUTES: ReadonlyArray<readonly [string, (page: Page) => Promise<void>]> = [
  ["/", openWorkspace],
  [
    "/components",
    async (page) => {
      await page.goto("/components");
      await expect(page.locator("article [data-ui-kit-root]")).toHaveCount(
        CONTRACT_COMPONENTS.length,
      );
    },
  ],
  [
    "/components/Button",
    async (page) => {
      await page.goto("/components/Button");
      await expect(page.getByRole("heading", { level: 1, name: "Button" })).toBeVisible();
    },
  ],
  [
    "/llm-context",
    async (page) => {
      await page.goto("/llm-context");
      await expect(page.getByTestId("prompt-total")).toBeVisible({ timeout: 30_000 });
    },
  ],
  ["/agent", openAgent],
];
