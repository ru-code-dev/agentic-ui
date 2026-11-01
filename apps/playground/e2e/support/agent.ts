import { expect, type Page } from "@playwright/test";

/** Opens /agent (a fresh chat per page) and waits for the model list of the agent server. */
export async function openAgent(page: Page): Promise<void> {
  await page.goto("/agent");
  await expect(page.getByRole("combobox", { name: "Модель" })).toBeVisible();
}

/** Types the paste + instruction and sends it with the button. */
export async function sendPrompt(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Данные и инструкция" }).fill(text);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
}

export const lastTurn = (page: Page) => page.getByTestId("chat-turn").last();
export const preview = (page: Page) => page.getByTestId("agent-preview");

export const PROMPT = "Имя,Карта\nАнна,Дебетовая\n\nПокажи форму заявки на карту.";
