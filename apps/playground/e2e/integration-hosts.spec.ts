import { expect, test, type Page } from "@playwright/test";
import { openIntegration, say, tab, turn } from "./support/integration.ts";

// Integration section (SV-C26, SV-C27), Scripted mode: hosts that draw their own chat, and a minimal server.

const CARD = "Покажи форму заявки на карту";
const events = (page: Page, request: string) =>
  page.locator(`[data-testid="integration-event"][data-request="${request}"]`);

test("[SV-C26] Bring your own chat: only replies with a UI block get a surface; actions go to the host's onAction", async ({
  page,
}) => {
  await openIntegration(page, "byo-chat");
  const ask = async (text: string, replies: number) => {
    await page.getByRole("textbox", { name: "Сообщение хосту" }).fill(text);
    await page.getByRole("button", { name: "Отправить хосту" }).click();
    await expect(page.locator('[data-testid="byo-message"][data-from="host"]')).toHaveCount(
      replies,
    );
  };
  await ask("Сколько стоит обслуживание?", 1);
  await expect(page.getByTestId("byo-message").nth(1)).toContainText("бесплатное");
  await expect(page.getByTestId("byo-message").nth(1).getByRole("textbox")).toHaveCount(0);
  await ask(CARD, 2);
  const reply = page.getByTestId("byo-message").nth(3);
  await expect(reply).toContainText("Вот форма заявки на карту.");
  await reply.getByRole("textbox", { name: "Имя" }).fill("Вера");
  await reply.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.getByTestId("byo-message").nth(4)).toContainText(
    'Хост получил действие form.submit: {"form":{"name":"Вера","phone":""}',
  );
  await expect(reply.getByText("Принято хостом")).toBeVisible(); // the host's own apply, in place
  await tab(page, /^Events/).click();
  await expect(events(page, "LLM")).toHaveCount(2);
  await expect(events(page, "POST /action")).toHaveCount(0); // no agent server involved
});

test("[SV-C26] Headless: own input, bubbles, loading and error from send/status/working; the default chat's render slots", async ({
  page,
}) => {
  await openIntegration(page, "headless");
  const own = page.getByRole("region", { name: "Свой чат" });
  await own.getByRole("textbox", { name: "Сообщение" }).fill(CARD);
  await own.getByRole("button", { name: "Спросить" }).click();
  await expect(own.getByTestId("headless-working")).toBeVisible();
  await expect(own.getByTestId("headless-working")).toHaveCount(0);
  await expect(own.getByTestId("headless-turn")).toHaveCount(1);
  await expect(own.getByText("Вот форма заявки на карту.")).toBeVisible();
  await own.getByRole("textbox", { name: "Имя" }).fill("Гена");
  await own.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(own.getByText("Заявка принята: Гена")).toBeVisible();
  await own.getByRole("textbox", { name: "Сообщение" }).fill("сбой");
  await own.getByRole("button", { name: "Спросить" }).click();
  await expect(own.getByTestId("headless-error")).toContainText("сервис временно недоступен");

  const slotted = page.getByRole("region", { name: "Чат со слотами" });
  const send = async (text: string) => {
    await slotted.getByRole("textbox", { name: "Сообщение в чат со слотами" }).fill(text);
    await slotted.getByRole("button", { name: "Послать" }).click();
  };
  await send("Нарисуй график");
  await expect(slotted.getByTestId("slot-working")).toBeVisible();
  await expect(slotted.getByTestId("slot-placeholder")).toBeVisible();
  await expect(slotted.getByTestId("a2ui-placeholder")).toHaveCount(0); // the slot replaced it
  await send("сбой");
  await expect(slotted.getByTestId("slot-error")).toContainText("сервис временно недоступен");
  await expect(slotted.getByRole("button", { name: "Повторить запрос" })).toBeVisible();
});

test("[SV-C26] Minimal server: with only /prompt and /action the chat works; optional endpoints are probed once", async ({
  page,
}) => {
  await openIntegration(page, "minimal-server");
  await expect(page.getByTestId("minimal-capabilities")).toContainText("Нет /models");
  await expect(page.getByRole("combobox", { name: "Модель" })).toHaveCount(0);
  await say(page, CARD);
  await turn(page, 0).getByRole("textbox", { name: "Имя" }).fill("Дина");
  await turn(page, 0).getByRole("button", { name: "Отправить заявку" }).click();
  await expect(turn(page, 1)).toHaveAttribute("data-state", "ui");
  await expect(turn(page, 0).getByText("Заявка принята: Дина")).toBeVisible();
  await page.getByRole("textbox", { name: "Напишите, что показать…" }).fill("Ответь, но долго");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await page.getByTestId("a2ui-working").getByRole("button", { name: "Отменить" }).click();
  await expect(turn(page, 2)).toHaveAttribute("data-state", "cancelled"); // aborted in the browser
  await say(page, "Покажи траты таблицей");
  await expect(turn(page, 3)).toHaveAttribute("data-state", "ui");
  await tab(page, /^Events/).click();
  await expect(events(page, "GET /models")).toHaveCount(1);
  await expect(events(page, "GET /models").getByTestId("integration-event-status")).toHaveText(
    "404",
  );
  await expect(events(page, "POST /cancel")).toHaveCount(1);
  expect(await events(page, "GET /progress").count()).toBeLessThanOrEqual(1);
  await expect(events(page, "POST /prompt")).toHaveCount(3);
});
