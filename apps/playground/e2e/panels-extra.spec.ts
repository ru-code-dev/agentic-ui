import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { watchConsole } from "./support/console.ts";
import {
  CATALOG_ID,
  openPanel,
  openWorkspace,
  previewFrame,
  selectExample,
  setEditorText,
} from "./support/workspace.ts";

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const tokens = async (page: Page) =>
  Number((await page.getByTestId("prompt-tokens").textContent())?.replace(/\D/g, ""));

/** Distinct inline Shiki colours of a highlighted block. */
const shikiColours = (code: Locator) =>
  code
    .locator("span[style*='color']")
    .evaluateAll((spans) => [...new Set(spans.map((span) => getComputedStyle(span).color))]);

test("[PG-12, PR-03] a disabled rule does not reply; deleting every rule shows the empty state; Load presets restores them", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openWorkspace(page);
  await selectExample(page, "19-bank-fraud-alert");
  await openPanel(page, /Mock rules/);
  const fraud = page
    .getByTestId("mock-rule")
    .filter({ has: page.locator("input[value='fraud.block']") });
  await expect(fraud).toHaveCount(1);
  const enabled = fraud.getByRole("switch", { name: "Enabled" });
  await expect(enabled).toBeChecked();
  await enabled.click();
  await expect(enabled).not.toBeChecked();

  const frame = previewFrame(page);
  await frame.getByRole("button", { name: "Заблокировать карту" }).click();
  await openPanel(page, /Events/);
  await expect(page.getByTestId("event-name")).toHaveText(["fraud.block"]);
  await expect(frame.getByRole("heading", { name: "Карта заблокирована" })).toHaveCount(0);

  await openPanel(page, /Mock rules/);
  const rules = page.getByTestId("mock-rule");
  for (let left = await rules.count(); left > 0; left -= 1) {
    await rules.first().getByRole("button", { name: "Delete rule" }).click();
    await expect(rules).toHaveCount(left - 1);
  }
  await expect(page.getByText("No mock rules")).toBeVisible();

  await page.getByRole("button", { name: "Load presets" }).click();
  await expect(rules).toHaveCount(5);
  await expect(page.getByRole("switch", { name: "Enabled", checked: true })).toHaveCount(5);
  await frame.getByRole("button", { name: "Заблокировать карту" }).click();
  await expect(frame.getByRole("heading", { name: "Карта заблокирована" })).toBeVisible();
  console.expectClean();
});

test("[PG-14, PG-22, PR-03] the Prompt tab copies the prompt, More examples raises the count, and the Markdown is highlighted", async ({
  page,
}) => {
  await openWorkspace(page);
  await openPanel(page, "Prompt");
  const panel = page.getByRole("tabpanel", { name: "Prompt" });
  const code = panel.getByTestId("highlighted-code");
  await expect(code).toContainText("<a2ui-json>");
  expect((await shikiColours(code)).length).toBeGreaterThanOrEqual(2);

  await panel.getByRole("button", { name: "Copy", exact: true }).click();
  const nine = await clipboard(page);
  expect(nine).toContain("<a2ui-json>");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(readFileSync(await download.path(), "utf8")).toBe(nine);

  const before = await tokens(page);
  await expect(page.getByTestId("prompt-examples")).toHaveText("9");
  await page.getByRole("button", { name: "More examples" }).click();
  await expect(page.getByTestId("prompt-examples")).toHaveText("10");
  await expect.poll(() => tokens(page)).toBeGreaterThan(before);
  await panel.getByRole("button", { name: "Copy", exact: true }).click();
  await expect.poll(async () => (await clipboard(page)).length).toBeGreaterThan(nine.length);
});

test("[PG-10, PR-03] a checkbox in the preview updates the Data model tab", async ({ page }) => {
  await openWorkspace(page);
  await openPanel(page, /Data model/);
  const editor = page.getByTestId("data-model-editor");
  await expect(editor).toHaveValue(/"remember": true/);
  const frame = previewFrame(page);
  const remember = frame.getByRole("checkbox", { name: /Запомнить меня/ });
  // Chakra hides the native input; the user clicks the visible label.
  await frame.getByText("Запомнить меня").click();
  await expect(remember).not.toBeChecked();
  await expect(editor).toHaveValue(/"remember": false/);
  await frame.getByText("Запомнить меня").click();
  await expect(editor).toHaveValue(/"remember": true/);
});

test("[PG-10, PR-03] the Data model tab switches between surfaces", async ({ page }) => {
  await openWorkspace(page);
  const surface = (surfaceId: string, text: string, value: object) => [
    { version: "v0.9", createSurface: { surfaceId, catalogId: CATALOG_ID } },
    { version: "v0.9", updateDataModel: { surfaceId, path: "/info", value } },
    {
      version: "v0.9",
      updateComponents: { surfaceId, components: [{ id: "root", component: "Text", text }] },
    },
  ];
  await setEditorText(
    page,
    JSON.stringify(
      [
        ...surface("first", "Первая поверхность", { city: "Москва" }),
        ...surface("second", "Вторая поверхность", { city: "Казань" }),
      ],
      null,
      2,
    ),
  );
  await expect(previewFrame(page).getByText("Вторая поверхность")).toBeVisible();
  await openPanel(page, /Data model/);
  const panel = page.getByRole("tabpanel", { name: /Data model/ }).last();
  await expect(page.getByRole("textbox", { name: "Data model of first" })).toHaveValue(/Москва/);
  await panel.getByRole("button", { name: "second", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Data model of second" })).toHaveValue(/Казань/);
  await panel.getByRole("button", { name: "first", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Data model of first" })).toHaveValue(/Москва/);
});

test("[PG-11, PR-03] an event row shows its time and surface", async ({ page }) => {
  await openWorkspace(page);
  const frame = previewFrame(page);
  await frame.getByRole("textbox", { name: /Электронная почта/ }).fill("anna@bank.ru");
  await frame.getByLabel(/Пароль/).fill("секретный-пароль");
  await frame.getByRole("button", { name: "Войти" }).click();
  await openPanel(page, /Events/);
  const row = page
    .getByTestId("event-row")
    .filter({ has: page.getByTestId("event-name").getByText("login.submit", { exact: true }) });
  const cells = row.getByRole("cell");
  await expect(cells.nth(0)).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await expect(cells.nth(1)).toHaveText("action");
  await expect(cells.nth(2)).toHaveText("login");
});
