import { expect, test } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { saveScreenshot } from "./support/pixels.ts";

test("PG-20: the catalog shows 19 live cards that open their detail page", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/components");
  await expect(page.locator("article[data-testid^=card-]")).toHaveCount(19);
  await expect(page.locator("article [data-ui-kit-root]")).toHaveCount(19);
  await expect(
    page.getByTestId("card-Table").getByRole("gridcell", { name: "Пятёрочка" }),
  ).toBeVisible();
  saveScreenshot("playground-components", await page.screenshot());
  await page.getByTestId("card-Switch").getByRole("link").click();
  await expect(page).toHaveURL(/\/components\/Switch$/);
  await expect(page.getByRole("heading", { level: 1, name: "Switch" })).toBeVisible();
  console.expectClean();
});

test("PG-20, PG-22: the detail view has a live preview, props table and highlighted JSON / React / Contract / JSON Schema", async ({
  page,
}) => {
  const console = watchConsole(page);
  await page.goto("/components/Button");
  const preview = page.getByTestId("scoped-Button");
  await expect(preview.getByRole("button", { name: "Перевести деньги" })).toBeVisible();
  const props = page.getByTestId("props-table");
  await expect(props.locator("tbody tr")).toHaveCount(11);
  await expect(props).toContainText("isFullWidth");
  const code = (tab: string) =>
    page.getByRole("tabpanel", { name: tab }).getByTestId("highlighted-code");
  await expect(code("JSON").locator("span[style*='color']").first()).toBeVisible();
  await expect(code("JSON")).toContainText('"component": "Button"');
  await page.getByRole("tab", { name: "React" }).click();
  await expect(code("React")).toContainText("createComponentImplementation(ButtonApi");
  await page.getByRole("tab", { name: "Contract" }).click();
  await expect(code("Contract")).toContainText('name: "Button"');
  await page.getByRole("tab", { name: "JSON Schema" }).click();
  await expect(code("JSON Schema")).toContainText('"const": "Button"');
  await page.getByRole("button", { name: "Copy" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"const": "Button"');
  saveScreenshot("playground-component-detail", await page.screenshot());
  console.expectClean();
});

test("PG-20: passthrough components show their one-line registry entry and the generic factory", async ({
  page,
}) => {
  await page.goto("/components/Text");
  await page.getByRole("tab", { name: "React" }).click();
  const react = page.getByRole("tabpanel", { name: "React" }).getByTestId("highlighted-code");
  await expect(react).toContainText("Text: passthrough(TextApi, Text,");
  await expect(react).toContainText("export function passthrough");
});
