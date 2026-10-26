import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { saveScreenshot } from "./support/pixels.ts";
import {
  CATALOG_ID,
  editorText,
  openPanel,
  openWorkspace,
  previewFrame,
  selectExample,
  setEditorText,
  textSurface,
} from "./support/workspace.ts";

test("PG-09: the Errors tab lists JSON, schema and preview console errors", async ({ page }) => {
  await openWorkspace(page);
  await openPanel(page, /Errors/);
  await expect(page.getByText("No errors")).toBeVisible();
  await setEditorText(page, '[{"version": "v0.9",}]');
  await expect(page.getByTestId("error-row")).toContainText(["JSON"]);
  await expect(page.getByTestId("errors-panel")).toContainText("line 1, column 21");
  await setEditorText(
    page,
    JSON.stringify(
      [
        { version: "v0.9", createSurface: { surfaceId: "s", catalogId: CATALOG_ID } },
        {
          version: "v0.9",
          updateComponents: {
            surfaceId: "s",
            components: [{ id: "root", component: "Text", text: "a", fontSize: "huge" }],
          },
        },
      ],
      null,
      2,
    ),
  );
  await expect(page.getByTestId("errors-panel")).toContainText(
    "messages[1].updateComponents.components[0].fontSize",
  );
  await previewFrame(page)
    .locator("body")
    .evaluate(() => console.error("Сообщение из консоли превью"));
  await expect(page.getByTestId("errors-panel")).toContainText("Сообщение из консоли превью");
  saveScreenshot("playground-errors", await page.screenshot());
});

test("PG-11: the Events tab logs actions with context and data model, and clears", async ({
  page,
}) => {
  await openWorkspace(page);
  const frame = previewFrame(page);
  await frame.getByRole("textbox", { name: /Электронная почта/ }).fill("anna@bank.ru");
  await frame.getByLabel(/Пароль/).fill("секретный-пароль");
  await frame.getByRole("button", { name: "Войти" }).click();
  await openPanel(page, /Events/);
  const row = page
    .getByTestId("event-row")
    .filter({ has: page.getByTestId("event-name").getByText("login.submit", { exact: true }) });
  await expect(row).toContainText('{"email":"anna@bank.ru"}');
  await expect(row).toContainText('"remember":true');
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("No events yet")).toBeVisible();
});

test("PG-12: mock rules answer events with simulated agent replies; rules can be added, edited and deleted", async ({
  page,
}) => {
  await openWorkspace(page);
  await selectExample(page, "19-bank-fraud-alert");
  const frame = previewFrame(page);
  await frame.getByRole("button", { name: "Заблокировать карту" }).click();
  await expect(frame.getByRole("heading", { name: "Карта заблокирована" })).toBeVisible();
  await openPanel(page, /Events/);
  await expect(page.getByTestId("event-name").first()).toHaveText(
    "fraud.block → fraud-card-blocked",
  );

  await openPanel(page, /Mock rules/);
  await page.getByRole("button", { name: "Add rule" }).click();
  const rule = page.getByTestId("mock-rule").last();
  await rule.getByLabel("Event name").fill("card.reissue");
  await rule.getByLabel("Reply messages").fill(
    JSON.stringify([
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "fraud",
          components: [{ id: "root", component: "Text", text: "Новая карта заказана" }],
        },
      },
    ]),
  );
  await expect(rule).toContainText("1 message");
  await frame.getByRole("button", { name: "Перевыпустить карту" }).click();
  await expect(frame.getByText("Новая карта заказана")).toBeVisible();
  const count = await page.getByTestId("mock-rule").count();
  await rule.getByRole("button", { name: "Delete rule" }).click();
  await expect(page.getByTestId("mock-rule")).toHaveCount(count - 1);
  saveScreenshot("playground-mock-rules", await page.screenshot());
});

test("PG-13: the Catalog tab shows catalog.json with copy and download", async ({ page }) => {
  await openWorkspace(page);
  await openPanel(page, "Catalog");
  await expect(page.getByTestId("highlighted-code").first()).toContainText(
    `"catalogId": "${CATALOG_ID}"`,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("catalog.json");
  expect(JSON.parse(readFileSync(await download.path(), "utf8")).catalogId).toBe(CATALOG_ID);
  await page.getByRole("button", { name: "Copy" }).last().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('"anyComponent"');
});

test("PG-14: the Prompt tab shows the system prompt with an examples control and token estimate", async ({
  page,
}) => {
  await openWorkspace(page);
  await openPanel(page, "Prompt");
  await expect(page.getByTestId("prompt-examples")).toHaveText("5");
  const before = Number(
    (await page.getByTestId("prompt-tokens").textContent())?.replace(/\D/g, ""),
  );
  await page.getByRole("button", { name: "Fewer examples" }).click();
  await expect(page.getByTestId("prompt-examples")).toHaveText("4");
  await expect
    .poll(async () =>
      Number((await page.getByTestId("prompt-tokens").textContent())?.replace(/\D/g, "")),
    )
    .toBeLessThan(before);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("system-prompt.md");
  expect(readFileSync(await download.path(), "utf8")).toContain("<a2ui-json>");
});

test("PG-15: editor, selection, device and mock rules persist; Reset all restores defaults", async ({
  page,
}) => {
  await openWorkspace(page);
  await selectExample(page, "05-data-table");
  await setEditorText(page, JSON.stringify(textSurface("Сохранено")));
  await page.getByRole("combobox", { name: "Device" }).click();
  await page.getByRole("option", { name: /Pixel 7/ }).click();
  await openPanel(page, /Mock rules/);
  await page.getByRole("button", { name: "Add rule" }).click();
  await page.reload();
  expect(await editorText(page)).toContain("Сохранено");
  await expect(page.getByRole("combobox", { name: "Device" })).toContainText("Pixel 7");
  await expect(page.getByTestId("example-05-data-table")).toHaveAttribute("aria-current", "true");
  await openPanel(page, /Mock rules/);
  await expect(page.getByTestId("mock-rule")).toHaveCount(6);
  await page.getByRole("button", { name: "Reset all" }).click();
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Device" })).toContainText("iPhone 15");
  await expect(page.getByTestId("mock-rule")).toHaveCount(5);
});
