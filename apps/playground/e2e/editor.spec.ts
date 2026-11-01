import { expect, test } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { COMPOSITION_COUNT, SNIPPET_COMPONENTS } from "./support/contract.ts";
import {
  editorText,
  openPanel,
  openWorkspace,
  previewFrame,
  selectExample,
  setEditorText,
  textSurface,
} from "./support/workspace.ts";

test("[PG-01, PG-02] the sidebar lists every composition and component snippet; they load into editor and preview", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openWorkspace(page);
  await expect(page.getByRole("region", { name: "Compositions" }).getByRole("button")).toHaveCount(
    COMPOSITION_COUNT,
  );
  await expect(page.getByRole("region", { name: "Components" }).getByRole("button")).toHaveCount(
    SNIPPET_COMPONENTS.length,
  );
  await selectExample(page, "15-bank-transfer");
  expect(await editorText(page)).toContain('"surfaceId": "transfer"');
  await expect(
    previewFrame(page).getByRole("heading", { name: "Перевод по номеру телефона" }),
  ).toBeVisible();
  await selectExample(page, "Avatar");
  await expect(previewFrame(page).getByRole("img", { name: "Анна Смирнова" })).toBeVisible();
  console.expectClean();
});

test("[PG-03] lint with line/column, format, copy and reset", async ({ page }) => {
  await openWorkspace(page);
  await setEditorText(page, '[\n  {"version": "v0.9",\n  "createSurface": }\n]');
  await expect(page.getByTestId("editor-status")).toHaveText("Invalid JSON · line 3");
  await expect(page.locator(".cm-lintRange-error")).toBeVisible();
  await page.getByRole("button", { name: "Reset to example" }).click();
  await expect(page.getByTestId("editor-status")).toHaveText("Valid");
  await setEditorText(page, JSON.stringify(textSurface("Сжатый JSON")));
  await page.getByRole("button", { name: "Format" }).click();
  expect((await editorText(page)).length).toBeGreaterThan(
    JSON.stringify(textSurface("Сжатый JSON")).length,
  );
  await page.getByRole("button", { name: "Copy JSON" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    '"text": "Сжатый JSON"',
  );
});

test("[PG-04] accepts a message array, JSONL, a single message and an example file", async ({
  page,
}) => {
  await openWorkspace(page);
  const [create, update] = textSurface("Формат");
  const frame = previewFrame(page);
  await setEditorText(page, `${JSON.stringify(create)}\n${JSON.stringify(update)}`);
  await expect(frame.getByText("Формат")).toBeVisible();
  await setEditorText(
    page,
    JSON.stringify({
      name: "Пример",
      description: "Файл",
      messages: textSurface("Из файла примера"),
    }),
  );
  await expect(frame.getByText("Из файла примера")).toBeVisible();
  await setEditorText(page, JSON.stringify(textSurface("Массив")));
  await expect(frame.getByText("Массив")).toBeVisible();
  await setEditorText(page, JSON.stringify(create));
  await expect(page.getByTestId("editor-status")).toHaveText("Valid");
  await expect(frame.getByText("Массив")).toHaveCount(0);
});

test("[PG-05] the last valid render stays visible while the JSON is invalid", async ({ page }) => {
  await openWorkspace(page);
  await setEditorText(page, JSON.stringify(textSurface("Живой рендер")));
  await expect(previewFrame(page).getByText("Живой рендер")).toBeVisible();
  await page.keyboard.insertText("{");
  await expect(page.getByTestId("stale-preview")).toHaveText("Showing last valid render");
  await expect(previewFrame(page).getByText("Живой рендер")).toBeVisible();
});

test("[PG-05] invalid JSON restored on reload explains why nothing renders", async ({ page }) => {
  await openWorkspace(page);
  await setEditorText(page, "[{");
  await expect(page.getByTestId("editor-status")).toContainText("Invalid JSON");
  await page.reload();
  await expect(page.getByTestId("stale-preview")).toHaveText("Nothing to render yet");
  await expect(page.getByText("The JSON does not parse")).toBeVisible();
  await page.getByRole("button", { name: /Reset to/ }).click();
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
  await expect(page.getByText("The JSON does not parse")).toBeHidden();
});

test("[PG-17] Ctrl/Cmd+S formats and Ctrl/Cmd+Enter re-renders", async ({ page }) => {
  await openWorkspace(page);
  const frame = previewFrame(page);
  await frame.getByRole("textbox", { name: /Электронная почта/ }).fill("anna@bank.ru");
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(frame.getByRole("textbox", { name: /Электронная почта/ })).toHaveValue("");
  await setEditorText(page, JSON.stringify(textSurface("Формат по клавише")));
  await page.keyboard.press("ControlOrMeta+s");
  expect(await editorText(page)).toContain('  {    "version": "v0.9"');
});

test("[PG-21] the composition view shows generated JSX and the live data model", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("tab", { name: "JSX" }).click();
  await expect(page.getByTestId("jsx-view")).toContainText(
    '<Container maxW="container.sm" py="10">',
  );
  await expect(page.getByTestId("jsx-view")).toContainText("value={data.form.email}");
  await previewFrame(page)
    .getByRole("textbox", { name: /Электронная почта/ })
    .fill("anna@bank.ru");
  await page.getByRole("tab", { name: "Data model" }).first().click();
  await expect(page.getByTestId("editor-data-model")).toContainText('"email": "anna@bank.ru"');
  await openPanel(page, /Errors/);
});
