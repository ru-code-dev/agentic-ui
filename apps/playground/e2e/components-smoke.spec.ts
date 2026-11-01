import { expect, test } from "@playwright/test";
import { CONTRACT_COMPONENTS, SNIPPET_COMPONENTS } from "./support/contract.ts";
import { watchConsole } from "./support/console.ts";

/** Every component of the contract has a snippet; its page is /components/<name> (PG-20). */
const NAMES = SNIPPET_COMPONENTS;

test("[P8-components-smoke, DEC-036] the smoke covers all 19 components of P8 and every later one: the contract's list", () => {
  expect(NAMES).toEqual(CONTRACT_COMPONENTS.toSorted());
});

test.describe("[P8-components-smoke, PR-02, INT-08] every /components/<name> page renders with zero console errors", () => {
  for (const name of NAMES) {
    test(name, async ({ page }) => {
      const console = watchConsole(page);
      await page.goto(`/components/${name}`);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      const preview = page.getByTestId(`scoped-${name}`);
      await expect(preview.locator("[data-ui-kit-root]")).toBeAttached();
      await expect(preview.locator("[data-ui-kit-root] > *").first()).toBeAttached();
      await expect(page.getByTestId("props-table").locator("tbody tr").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      console.expectClean();
    });
  }
});
