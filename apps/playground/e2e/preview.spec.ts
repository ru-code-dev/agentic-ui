import { expect, test } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { saveScreenshot } from "./support/pixels.ts";
import {
  CATALOG_ID,
  openPanel,
  openWorkspace,
  previewFrame,
  selectExample,
  setEditorText,
} from "./support/workspace.ts";

test("[PG-06] the device iframe renders /preview, with a Chakra Modal inside its own document", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openWorkspace(page);
  await selectExample(page, "06-confirm-delete");
  const frame = previewFrame(page);
  await frame.getByRole("button", { name: "Удалить" }).click();
  const dialog = frame.getByRole("dialog");
  await expect(dialog).toContainText("Шаблон нельзя будет восстановить.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(dialog).toHaveCSS("opacity", "1");
  saveScreenshot("workspace-device-modal-open", await page.screenshot());
  console.expectClean();
});

test("[PG-07] device presets, rotation, zoom to fit and fill", async ({ page }) => {
  await openWorkspace(page);
  const viewport = page.getByTestId("device-viewport");
  await expect(viewport).toHaveAttribute("data-width", "393");
  await page.getByRole("combobox", { name: "Device" }).click();
  await page.getByRole("option", { name: /^iPad\s*768×1024/ }).click();
  await expect(viewport).toHaveAttribute("data-width", "768");
  await page.getByRole("button", { name: "Rotate" }).click();
  await expect(viewport).toHaveAttribute("data-width", "1024");
  await expect(page.getByTestId("device-size")).toHaveText("1024×768");
  const fitted = (await viewport.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "Zoom to fit" }).click();
  await expect.poll(async () => (await viewport.boundingBox())?.width ?? 0).toBeGreaterThan(fitted);
  await page.getByRole("combobox", { name: "Device" }).click();
  await page.getByRole("option", { name: /Fill/ }).click();
  await expect(viewport).toHaveCount(0);
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
});

test("[PG-08] an unknown component type shows a visible error in the preview and the Errors tab", async ({
  page,
}) => {
  await openWorkspace(page);
  await setEditorText(
    page,
    JSON.stringify(
      [
        { version: "v0.9", createSurface: { surfaceId: "bad", catalogId: CATALOG_ID } },
        {
          version: "v0.9",
          updateComponents: { surfaceId: "bad", components: [{ id: "root", component: "Slider" }] },
        },
      ],
      null,
      2,
    ),
  );
  await expect(previewFrame(page).getByTestId("preview-error")).toContainText(
    "Unknown component type 'Slider'",
  );
  await openPanel(page, /Errors/);
  await expect(page.getByTestId("errors-panel")).toContainText(
    "messages[1].updateComponents.components[0]",
  );
  await expect(page.getByTestId("errors-panel")).toContainText("Runtime");
});

test("[PG-10, PG-24] data model flows from the preview to the app and edits apply back", async ({
  page,
}) => {
  await openWorkspace(page);
  const frame = previewFrame(page);
  await frame.getByRole("textbox", { name: /Электронная почта/ }).fill("anna@bank.ru");
  await openPanel(page, /Data model/);
  const editor = page.getByTestId("data-model-editor");
  await expect(editor).toHaveValue(/"email": "anna@bank.ru"/);
  await editor.fill(
    JSON.stringify({ form: { email: "boris@bank.ru", password: "", remember: false } }),
  );
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(frame.getByRole("textbox", { name: /Электронная почта/ })).toHaveValue(
    "boris@bank.ru",
  );
  await expect(frame.getByRole("checkbox", { name: /Запомнить меня/ })).not.toBeChecked();
});

test("[PG-23, PG-24] open in new tab restores from the hash and stays synced over the channel", async ({
  page,
  context,
  browser,
}) => {
  const console = watchConsole(page);
  await openWorkspace(page);
  await selectExample(page, "06-confirm-delete");
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Open in new tab" }).click(),
  ]);
  const tabConsole = watchConsole(tab);
  await expect(tab.getByRole("button", { name: "Удалить" })).toBeVisible();
  const restorableUrl = tab.url();
  expect(new URL(restorableUrl).hash.length).toBeGreaterThan(1);

  await selectExample(page, "Button");
  await expect(tab.getByRole("button", { name: "Перевести деньги" })).toBeVisible();
  await tab.getByRole("button", { name: "Перевести деньги" }).click();
  await openPanel(page, /Events/);
  await expect(page.getByTestId("event-name").first()).toHaveText("transfer.start");
  saveScreenshot("preview-new-tab", await tab.screenshot());

  // A separate browser context shares no BroadcastChannel with the app: only the hash drives it.
  const isolated = await browser.newContext();
  const restored = await isolated.newPage();
  await restored.goto(restorableUrl);
  await restored.getByRole("button", { name: "Удалить" }).click();
  await expect(restored.getByRole("dialog")).toBeVisible();
  await isolated.close();
  console.expectClean();
  tabConsole.expectClean();
});
