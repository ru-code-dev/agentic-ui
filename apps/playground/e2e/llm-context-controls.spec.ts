import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { watchConsole } from "./support/console.ts";
import { CONTRACT_COMPONENTS } from "./support/contract.ts";

const total = async (page: Page) =>
  Number(
    (await page.getByTestId("prompt-total").locator("span").first().textContent())?.replace(
      /\D/g,
      "",
    ),
  );

test("[PG-26, PR-03] component checkboxes, examples and format recompute the total and restore it", async ({
  page,
}) => {
  const console = watchConsole(page);
  await page.goto("/llm-context");
  await expect(page.getByTestId("prompt-total")).toBeVisible({ timeout: 30_000 });
  const delta = page.getByTestId("total-delta");
  await expect(delta).toHaveText("±0 vs default");
  const initial = await total(page);

  const avatar = page.getByRole("checkbox", { name: "Avatar" });
  await expect(avatar).toBeChecked();
  await avatar.click();
  await expect(avatar).not.toBeChecked();
  await expect(delta).toHaveText(/^−[\d,]+ vs default$/);
  await expect(page.getByTestId("component-cost")).toHaveCount(CONTRACT_COMPONENTS.length - 1);
  expect(await total(page)).toBeLessThan(initial);
  await avatar.click();
  await expect(delta).toHaveText("±0 vs default");
  expect(await total(page)).toBe(initial);

  await page.getByRole("button", { name: "More examples" }).click();
  await expect(page.getByTestId("llm-examples")).toHaveText("10");
  await expect(delta).toHaveText(/^\+[\d,]+ vs default$/);
  expect(await total(page)).toBeGreaterThan(initial);
  await page.getByRole("button", { name: "Fewer examples" }).click();
  await expect(delta).toHaveText("±0 vs default");

  const format = (name: string) =>
    page.getByRole("radio", { name }).or(page.getByRole("button", { name, exact: true }));
  await format("Express").click();
  await expect(page.getByTestId("section-envelope")).toHaveCount(0);
  await expect(delta).not.toHaveText("±0 vs default");
  await format("Direct JSON").click();
  await expect(page.getByTestId("section-envelope")).toBeVisible();
  await expect(delta).toHaveText("±0 vs default");
  expect(await total(page)).toBe(initial);
  console.expectClean();
});

test("[PG-26, PR-03] the assembled prompt copies and downloads; the 1M window rescales the gauge", async ({
  page,
}) => {
  await page.goto("/llm-context");
  await expect(page.getByTestId("prompt-total")).toBeVisible({ timeout: 30_000 });
  const viewer = page.getByTestId("prompt-viewer");
  await viewer.getByRole("button", { name: "Copy prompt" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("<a2ui-json>");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    viewer.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("system-prompt.md");
  expect(readFileSync(await download.path(), "utf8")).toBe(copied);

  const gauge = page.getByTestId("context-gauge");
  await expect(gauge).toContainText("/ 128k");
  const percent = async () => Number(/([\d.]+)%/.exec((await gauge.textContent()) ?? "")?.[1]);
  const before = await percent();
  await page.getByRole("combobox", { name: "Context window" }).click();
  await page.getByRole("option", { name: "1M tokens" }).click();
  await expect(gauge).toContainText("/ 1M");
  expect(await percent()).toBeLessThan(before);
});
