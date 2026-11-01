import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { watchConsole } from "./support/console.ts";
import { openIntegration, say, surface, tab, turn } from "./support/integration.ts";

// Integration section (SV-C26, SV-C27), Scripted mode: the built-in deterministic agent in the browser.

const CARD = "Покажи форму заявки на карту";
const SPENDING = "Покажи траты таблицей";
const SLUGS = [
  "full-chat",
  "follow",
  "single-panel",
  "byo-chat",
  "headless",
  "minimal-server",
  "surface-history",
  "orchestrator",
];
const squash = (text: string) => text.replace(/\s+/g, "");

test("[SV-C26] Full chat (anchored): an action updates the earlier surface in place, a new topic creates a new surface", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openIntegration(page, "full-chat");
  await expect(page.getByRole("combobox", { name: "Модель" })).toBeVisible(); // scripted /models
  await say(page, CARD);
  await expect(turn(page, 0)).toHaveAttribute("data-state", "ui");
  await expect(turn(page, 0).getByTestId("a2ui-text")).toHaveText("Вот форма заявки на карту.");
  await turn(page, 0).getByRole("textbox", { name: "Имя" }).fill("Анна");
  await turn(page, 0).getByRole("button", { name: "Отправить заявку" }).click();
  await expect(turn(page, 1)).toHaveAttribute("data-state", "ui");
  await expect(page.getByTestId("a2ui-surface")).toHaveCount(1);
  await expect(turn(page, 0).getByText("Заявка принята: Анна")).toBeVisible(); // in place, turn 1
  await say(page, SPENDING);
  await expect(page.getByTestId("a2ui-surface")).toHaveCount(2);
  await expect(turn(page, 2).locator('[data-surface-id="spending"]')).toBeVisible();
  await expect(turn(page, 2).getByText("Пятёрочка")).toBeVisible();
  await tab(page, /^Events/).click();
  await expect(
    page.locator('[data-testid="integration-event"][data-request="POST /action"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-testid="integration-event"][data-request="POST /prompt"]'),
  ).toHaveCount(2);
  await tab(page, /^Data model/).click();
  await expect(
    page.locator('[data-testid="integration-data-model"][data-surface-id="card-form"]'),
  ).toContainText("Заявка принята: Анна");
  console.expectClean();
});

test("[SV-C26] Follow: an updated surface moves under the latest turn; interactive latest leaves older ones inert", async ({
  page,
}) => {
  await openIntegration(page, "follow");
  await say(page, CARD);
  await say(page, SPENDING);
  await expect(surface(page, "card-form")).toHaveAttribute("data-interactive", "false");
  await expect(turn(page, 1).locator('[data-surface-id="spending"]')).toBeVisible();
  await say(page, "Добавь в форму телефон");
  await expect(turn(page, 2).locator('[data-surface-id="card-form"]')).toBeVisible(); // followed
  await expect(turn(page, 0).getByTestId("a2ui-surface")).toHaveCount(0);
  await expect(surface(page, "card-form")).toHaveAttribute("data-interactive", "true");
  await expect(surface(page, "spending")).toHaveAttribute("data-interactive", "false");
  await expect(surface(page, "card-form").getByRole("textbox", { name: "Телефон" })).toBeVisible();
});

test("[SV-C26] Single panel: surfaces single + placement panel keep exactly one surface, updated in place", async ({
  page,
}) => {
  await openIntegration(page, "single-panel");
  const panel = page.getByTestId("a2ui-panel");
  await say(page, CARD);
  await expect(panel.getByTestId("a2ui-surface")).toHaveCount(1);
  await expect(
    panel.locator('[data-surface-id="main"]').getByText("Заявка на карту"),
  ).toBeVisible();
  await say(page, "Добавь телефон");
  await expect(turn(page, 1)).toHaveAttribute("data-state", "ui");
  await expect(panel.getByRole("textbox", { name: "Телефон" })).toBeVisible();
  await say(page, SPENDING);
  await expect(panel.getByTestId("a2ui-surface")).toHaveCount(1);
  await expect(panel.locator('[data-surface-id="main"]').getByText("Пятёрочка")).toBeVisible();
  await expect(page.getByTestId("a2ui-transcript").getByTestId("a2ui-surface")).toHaveCount(0);
});

test("[SV-C26] Surface history: created-in turn, updated-in turns, their messages and the current data model", async ({
  page,
}) => {
  await openIntegration(page, "surface-history");
  await say(page, CARD);
  await turn(page, 0).getByRole("textbox", { name: "Имя" }).fill("Борис");
  await turn(page, 0).getByRole("button", { name: "Отправить заявку" }).click();
  await expect(turn(page, 1)).toHaveAttribute("data-state", "ui");
  await say(page, SPENDING);
  const card = page.locator('[data-testid="surface-story"][data-surface-id="card-form"]');
  await expect(card.getByTestId("surface-step")).toHaveCount(2);
  await expect(card.getByTestId("surface-step").nth(0)).toHaveAttribute("data-kind", "created");
  await expect(card.getByTestId("surface-step").nth(0)).toContainText("createSurface");
  await expect(card.getByTestId("surface-step").nth(1)).toHaveAttribute("data-kind", "updated");
  await expect(card.getByTestId("surface-step").nth(1)).toContainText("form.submit");
  await expect(card.getByTestId("surface-step").nth(1)).toContainText('"/status"');
  await expect(card.getByTestId("surface-data")).toContainText("Заявка принята: Борис");
  const spending = page.locator('[data-testid="surface-story"][data-surface-id="spending"]');
  await expect(spending.getByTestId("surface-step")).toHaveCount(1);
  await expect(spending.getByTestId("surface-step")).toContainText("Ход 3");
});

test("[SV-C27] Orchestrator (auto UI): text-only answers, text + surface, and text + failed UI that keeps the text", async ({
  page,
}) => {
  await openIntegration(page, "orchestrator");
  await say(page, "Сколько стоит обслуживание?");
  await say(page, CARD);
  await say(page, "Нарисуй график трат");
  await expect(page.getByTestId("orchestrator-route")).toHaveText([
    "1: только текст",
    "2: текст + интерфейс",
    "3: текст, интерфейс не удался",
  ]);
  await expect(turn(page, 0).getByTestId("a2ui-text")).toContainText("бесплатное");
  await expect(turn(page, 0).getByTestId("a2ui-surface")).toHaveCount(0);
  await expect(turn(page, 1).getByTestId("a2ui-surface")).toHaveCount(1);
  await expect(turn(page, 2).getByTestId("a2ui-text")).toContainText("отвечаю текстом");
  await expect(turn(page, 2).getByTestId("orchestrator-no-ui")).toBeVisible();
  await expect(page.getByTestId("a2ui-surface")).toHaveCount(1);
});

test("[SV-C26] every Integration page's Code tab is the demo's own source file", async ({
  page,
}) => {
  for (const slug of SLUGS) {
    await openIntegration(page, slug);
    await tab(page, /^Code/).click();
    const file = new URL(`../src/integration/demos/${slug}.tsx`, import.meta.url);
    const code = page.getByRole("tabpanel", { name: "Code" });
    await expect(code).toContainText(`integration/demos/${slug}.tsx`);
    const shown = await code.locator("pre").first().innerText();
    expect(squash(shown), slug).toBe(squash(readFileSync(file, "utf8")));
  }
});

test("[SV-C26] Live mode: the Full chat talks to the agent server through the proxy and updates the surface in place", async ({
  page,
}) => {
  await openIntegration(page, "full-chat");
  await page.getByRole("radio", { name: "Live" }).click();
  await expect(page.getByTestId("integration-demo")).toHaveAttribute("data-mode", "live");
  const prompt = page.waitForRequest((r) => r.url().endsWith("/api/prompt"));
  await say(page, "Имя,Карта\nАнна,Дебетовая\n\nПокажи форму заявки на карту.");
  await prompt;
  await expect(turn(page, 0)).toHaveAttribute("data-state", "ui");
  await turn(page, 0).getByRole("textbox", { name: "Имя" }).fill("Анна");
  await turn(page, 0).getByRole("button", { name: "Отправить заявку" }).click();
  await expect(turn(page, 1)).toHaveAttribute("data-state", "ui");
  await expect(page.getByTestId("a2ui-surface")).toHaveCount(1);
  await expect(turn(page, 0).getByText("Заявка принята: Анна")).toBeVisible();
});
