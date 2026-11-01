import { expect, test } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { CONTRACT_COMPONENTS } from "./support/contract.ts";
import { previewFrame } from "./support/workspace.ts";

const TABS = [
  ["JSON", '"component": "Button"'],
  ["React", "createComponentImplementation(ButtonApi"],
  ["Contract", 'name: "Button"'],
] as const;

test("[PG-20, PG-22, PR-03] the JSON, React and Contract tabs copy their own highlighted code; the breadcrumb leads back", async ({
  page,
}) => {
  const console = watchConsole(page);
  await page.goto("/components/Button");
  const copied = new Set<string>();
  for (const [tab, marker] of TABS) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const panel = page.getByRole("tabpanel", { name: tab, exact: true });
    const code = panel.getByTestId("highlighted-code");
    await expect(code).toContainText(marker);
    const colours = await code
      .locator("span[style*='color']")
      .evaluateAll((spans) => [...new Set(spans.map((span) => getComputedStyle(span).color))]);
    expect(colours.length).toBeGreaterThanOrEqual(3);
    await panel.getByRole("button", { name: "Copy", exact: true }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain(marker);
    expect(text.trim()).toBe((await code.textContent())?.trim());
    copied.add(text);
  }
  expect(copied.size).toBe(TABS.length);

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Components" })
    .click();
  await expect(page).toHaveURL(/\/components$/);
  await expect(page.locator("article[data-testid^=card-]")).toHaveCount(CONTRACT_COMPONENTS.length);
  console.expectClean();
});

test("[PG-25, PR-03] the production build navigates by nav links, cards and browser history", async ({
  page,
}) => {
  const console = watchConsole(page);
  await page.goto("/");
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Pages" });
  await nav.getByRole("link", { name: "Components" }).click();
  await expect(page).toHaveURL(/\/components$/);
  await expect(nav.getByRole("link", { name: "Components" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByTestId("card-Avatar").getByRole("link").click();
  await expect(page).toHaveURL(/\/components\/Avatar$/);
  await expect(page.getByRole("heading", { level: 1, name: "Avatar" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/components$/);
  await expect(page.locator("article[data-testid^=card-]")).toHaveCount(CONTRACT_COMPONENTS.length);
  await nav.getByRole("link", { name: "Workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(nav.getByRole("link", { name: "Workspace" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByTestId("editor-status")).toHaveText("Valid");
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
  console.expectClean();
});
