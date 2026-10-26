import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { saveScreenshot } from "./support/pixels.ts";

const total = async (page: Page) =>
  Number(
    (await page.getByTestId("prompt-total").locator("span").first().textContent())?.replace(
      /\D/g,
      "",
    ),
  );

test("PG-26: sections, costs, payloads and the context gauge measured with the Qwen tokenizer by default", async ({
  page,
}) => {
  const console = watchConsole(page);
  await page.goto("/llm-context");
  await expect(page.getByTestId("prompt-total")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("tokenizer-accuracy")).toHaveText("exact");
  for (const id of [
    "base-rules",
    "envelope",
    "common-types",
    "catalog-rules",
    "components",
    "functions",
    "defs",
    "examples",
  ]) {
    await expect(page.getByTestId(`section-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId("component-cost")).toHaveCount(19);
  await expect(page.getByTestId("output-costs").locator("tr")).toHaveCount(20);
  await expect(page.getByTestId("turn-payloads")).toContainText("login.submit");
  await expect(page.getByTestId("context-gauge")).toContainText("/ 128k");
  saveScreenshot("playground-llm-context", await page.screenshot({ fullPage: true }));
  console.expectClean();
});

test("PG-26: live controls recompute with a delta vs the default prompt", async ({ page }) => {
  await page.goto("/llm-context");
  await expect(page.getByTestId("prompt-total")).toBeVisible({ timeout: 30_000 });
  const initial = await total(page);
  await page.getByRole("button", { name: "Minimal" }).click();
  await expect(page.getByTestId("component-cost")).toHaveCount(3);
  await expect(page.getByTestId("total-delta")).toHaveText(/^−[\d,]+ vs default$/);
  expect(await total(page)).toBeLessThan(initial);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Fewer examples" }).click();
  await expect(page.getByTestId("llm-examples")).toHaveText("4");
  await page.getByTestId("llm-instructions").fill("Ты — ассистент интернет-банка.");
  await expect(page.getByTestId("section-instructions")).toBeVisible();
  await page
    .getByRole("radio", { name: "Express" })
    .or(page.getByRole("button", { name: "Express" }))
    .click();
  await expect(page.getByTestId("section-envelope")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByTestId("total-delta")).toHaveText("±0 vs default");
  await page.getByTestId("sort-components").click();
  await expect(page.getByTestId("component-cost").first()).toContainText("Avatar");
});

test("PG-26: tokenizers are selectable and labelled exact or approximate; the window is selectable", async ({
  page,
}) => {
  await page.goto("/llm-context");
  await expect(page.getByTestId("prompt-total")).toBeVisible({ timeout: 30_000 });
  const qwen = await total(page);
  await page.getByRole("combobox", { name: "Tokenizer" }).click();
  await page.getByRole("option", { name: /OpenAI o200k/ }).click();
  await expect(page.getByTestId("tokenizer-accuracy")).toHaveText("exact");
  await expect.poll(() => total(page)).not.toBe(qwen);
  await page.getByRole("combobox", { name: "Tokenizer" }).click();
  await page.getByRole("option", { name: /Approximate/ }).click();
  await expect(page.getByTestId("tokenizer-accuracy")).toHaveText("approximate");
  await page.getByRole("combobox", { name: "Context window" }).click();
  await page.getByRole("option", { name: "32k tokens" }).click();
  await expect(page.getByTestId("context-gauge")).toContainText("/ 32k");
  await page.getByTestId("prompt-viewer").getByRole("link", { name: "Functions" }).click();
  await expect(page.locator("#prompt-functions")).toBeInViewport();
});
