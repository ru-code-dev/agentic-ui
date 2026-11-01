import { expect, type Page } from "@playwright/test";

/** Opens an Integration page (Scripted mode by default: the built-in agent, no server, no LLM). */
export async function openIntegration(page: Page, slug: string): Promise<void> {
  await page.goto(`/integration/${slug}`);
  await expect(page.getByTestId("integration-demo")).toBeVisible();
}

/** Sends a message through the package's default chat (its composer) and waits for the reply. */
export async function say(page: Page, text: string, scope = page.getByTestId("integration-demo")) {
  await scope.getByRole("textbox", { name: "Напишите, что показать…" }).fill(text);
  await scope.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(scope.getByTestId("a2ui-working")).toHaveCount(0, { timeout: 10_000 });
}

export const turn = (page: Page, index: number) => page.getByTestId("a2ui-turn").nth(index);
export const surface = (page: Page, id: string) =>
  page.locator(`[data-testid="a2ui-surface"][data-surface-id="${id}"]`);
export const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });
