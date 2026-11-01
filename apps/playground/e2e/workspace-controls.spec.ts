import { expect, test, type Page } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import {
  openPanel,
  openWorkspace,
  previewFrame,
  setEditorText,
  textSurface,
} from "./support/workspace.ts";

const PRESETS = [
  ["iPhone SE", 375, 667],
  ["iPhone 15", 393, 852],
  ["Pixel 7", 412, 915],
  ["iPad", 768, 1024],
  ["iPad landscape", 1024, 768],
  ["Laptop", 1280, 800],
  ["Desktop", 1440, 900],
] as const;

async function pickDevice(page: Page, option: RegExp): Promise<void> {
  await page.getByRole("combobox", { name: "Device" }).click();
  await page.getByRole("option", { name: option }).click();
}

test("[PG-07, PR-03] every device preset sets its viewport size; Rotate twice restores it", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openWorkspace(page);
  const viewport = page.getByTestId("device-viewport");
  for (const [label, width, height] of PRESETS) {
    await pickDevice(page, new RegExp(`^${label}\\s*${width}×${height}`));
    await expect(page.getByRole("combobox", { name: "Device" })).toContainText(label);
    await expect(viewport).toHaveAttribute("data-width", String(width));
    await expect(viewport).toHaveAttribute("data-height", String(height));
    await expect(page.getByTestId("device-size")).toHaveText(`${width}×${height}`);
  }
  await pickDevice(page, /^iPhone SE/);
  const rotate = page.getByRole("button", { name: "Rotate" });
  await rotate.click();
  await expect(viewport).toHaveAttribute("data-width", "667");
  await expect(viewport).toHaveAttribute("data-height", "375");
  await expect(rotate).toHaveAttribute("aria-pressed", "true");
  await rotate.click();
  await expect(viewport).toHaveAttribute("data-width", "375");
  await expect(viewport).toHaveAttribute("data-height", "667");
  await expect(rotate).toHaveAttribute("aria-pressed", "false");
  await pickDevice(page, /^Fill/);
  await expect(viewport).toHaveCount(0);
  await expect(page.getByTestId("device-size")).toHaveText("Fill");
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
  console.expectClean();
});

test("[PG-15, PG-07, PR-03] rotation and zoom to fit survive a reload", async ({ page }) => {
  await openWorkspace(page);
  const rotate = page.getByRole("button", { name: "Rotate" });
  const fit = page.getByRole("button", { name: "Zoom to fit" });
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  await rotate.click();
  await fit.click();
  await expect(page.getByTestId("device-viewport")).toHaveAttribute("data-width", "852");
  await page.reload();
  await expect(page.getByTestId("device-viewport")).toHaveAttribute("data-width", "852");
  await expect(page.getByTestId("device-size")).toHaveText("852×393");
  await expect(rotate).toHaveAttribute("aria-pressed", "true");
  await expect(fit).toHaveAttribute("aria-pressed", "false");
});

test("[PG-17, PR-03] the toolbar Re-render button renders the messages again from a clean state", async ({
  page,
}) => {
  await openWorkspace(page);
  const email = previewFrame(page).getByRole("textbox", { name: /Электронная почта/ });
  await email.fill("anna@bank.ru");
  await openPanel(page, /Data model/);
  await expect(page.getByTestId("data-model-editor")).toHaveValue(/"email": "anna@bank.ru"/);
  await page.getByRole("button", { name: "Re-render" }).click();
  await expect(email).toHaveValue("");
  await expect(page.getByTestId("data-model-editor")).toHaveValue(/"email": ""/);
});

test("[PG-08, PR-03] a createSurface with an unknown catalogId shows a visible error", async ({
  page,
}) => {
  await openWorkspace(page);
  const [, update] = textSurface("Чужой каталог");
  await setEditorText(
    page,
    JSON.stringify(
      [
        { version: "v0.9", createSurface: { surfaceId: "custom", catalogId: "urn:unknown" } },
        update,
      ],
      null,
      2,
    ),
  );
  await expect(previewFrame(page).getByTestId("preview-error")).toContainText("urn:unknown");
  await expect(previewFrame(page).getByText("Чужой каталог")).toHaveCount(0);
});

test("[PG-21, PR-03] the JSX view follows editor edits and is read-only", async ({ page }) => {
  await openWorkspace(page);
  await setEditorText(page, JSON.stringify(textSurface("Текст для JSX")));
  await page.getByRole("tab", { name: "JSX" }).click();
  const jsx = page.getByTestId("jsx-view");
  await expect(jsx).toContainText("Текст для JSX");
  await expect(jsx).not.toContainText("Вход в интернет-банк");
  const before = await jsx.textContent();
  await jsx.click();
  await page.keyboard.type("набранный текст");
  await page.keyboard.press("Backspace");
  expect(await jsx.textContent()).toBe(before);
  await expect(jsx.locator("[contenteditable=true], textarea, input")).toHaveCount(0);
});

test("[PG-03, PR-03] the JSON editor colours syntax tokens", async ({ page }) => {
  await openWorkspace(page);
  const colours = await page
    .locator(".cm-content .cm-line span")
    .evaluateAll((spans) => [...new Set(spans.map((span) => getComputedStyle(span).color))]);
  expect(colours.length).toBeGreaterThanOrEqual(3);
});

test("[PG-01, PR-03] a sidebar entry shows its name and description", async ({ page }) => {
  await openWorkspace(page);
  const entry = page.getByTestId("example-01-login");
  await expect(entry).toContainText("Вход");
  await expect(
    entry.getByText("Вход в интернет-банк по почте и паролю с проверкой полей."),
  ).toBeVisible();
  await expect(page.getByTestId("example-Avatar").locator("span").nth(1)).not.toBeEmpty();
});
