import { expect, type FrameLocator, type Page } from "@playwright/test";

/** The device preview iframe (`/preview`). */
export const previewFrame = (page: Page): FrameLocator =>
  page.frameLocator("[data-testid=device-frame]");

/** Opens the workspace with a clean persisted state and waits for the first render. */
export async function openWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("editor-status")).toHaveText("Valid");
  await expect(
    previewFrame(page).getByRole("heading", { name: "Вход в интернет-банк" }),
  ).toBeVisible();
}

/** Clicks a sidebar example (composition id or component name). */
export async function selectExample(page: Page, id: string): Promise<void> {
  await page.getByTestId(`example-${id}`).click();
}

/** Replaces the editor content (one input event, like a paste). */
export async function setEditorText(page: Page, text: string): Promise<void> {
  await page.getByRole("tab", { name: "JSON" }).first().click();
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

/** The editor content as plain text. */
export const editorText = (page: Page) =>
  page.locator(".cm-content").evaluate((node) => node.textContent ?? "");

/** Opens a bottom-panel tab by name. */
export async function openPanel(page: Page, name: RegExp | string): Promise<void> {
  await page.getByRole("tab", { name }).last().click();
}

export const CATALOG_ID = "urn:agentic-ui:catalog:ui-kit-one:v1";

export const textSurface = (text: string, extra: object[] = []) => [
  { version: "v0.9", createSurface: { surfaceId: "custom", catalogId: CATALOG_ID } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "custom",
      components: [{ id: "root", component: "Text", text }, ...extra],
    },
  },
];
