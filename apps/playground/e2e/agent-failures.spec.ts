import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { lastTurn, openAgent, preview, PROMPT, sendPrompt } from "./support/agent.ts";
import { CONTRACT_VERSION } from "./support/agent-mock.ts";

// Agent page on failing requests (A2 review): the real agent server + fake ACP agent, with single
// requests broken by page.route (network error, 5xx, refused model or cancel, slow reply).

const FALLBACK = new URL("../../agent-server/fallback.json", import.meta.url);
const status = (page: Page) => lastTurn(page).getByTestId("turn-status");
const heading = (page: Page) => preview(page).getByRole("heading", { name: "Заявка на карту" });
const requestsTo = (page: Page, path: string) => {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(path)) seen.push(r.postData() ?? "");
  });
  return seen;
};

test("[SV-C20, PR-03] an action clicked while a turn runs is not sent and the Events tab says so", async ({
  page,
}) => {
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(heading(page)).toBeVisible();
  await page.route("**/api/prompt", async (route) => {
    await new Promise((done) => setTimeout(done, 2500));
    await route.continue();
  });
  const actions = requestsTo(page, "/api/action");
  await sendPrompt(page, `${PROMPT} второй`);
  await expect(page.getByTestId("agent-working")).toBeVisible();
  await preview(page).getByRole("button", { name: "Отправить заявку" }).click();
  await page.getByRole("tab", { name: /^Events/ }).click();
  await expect(page.getByTestId("event-name").first()).toHaveText(
    "form.submit (не отправлено: агент занят)",
  );
  await expect(page.getByTestId("agent-working")).toHaveCount(0, { timeout: 10_000 });
  await expect(status(page)).toHaveText("Интерфейс готов");
  expect(actions).toEqual([]);
});

test("[PR-03, SV-C20] a failed action becomes an error turn; Повторить repeats that action with its data model", async ({
  page,
}) => {
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(heading(page)).toBeVisible();
  await preview(page).getByRole("textbox", { name: "Имя" }).fill("Анна");
  await page.route("**/api/action", (route) => route.abort("connectionrefused"));
  await preview(page).getByRole("button", { name: "Отправить заявку" }).click();
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(lastTurn(page)).toContainText("network");
  await expect(page.getByRole("button", { name: "Отправить", exact: true })).toBeDisabled(); // empty prompt
  await page.unroute("**/api/action");
  const prompts = requestsTo(page, "/api/prompt");
  const action = page.waitForRequest((r) => r.url().endsWith("/api/action"));
  await lastTurn(page).getByRole("button", { name: "Повторить" }).click();
  expect((await action).postDataJSON()).toMatchObject({
    event: { name: "form.submit" },
    dataModel: { form: { name: "Анна" } },
  });
  await expect(preview(page).getByText("Заявка принята: Анна")).toBeVisible();
  expect(prompts).toEqual([]);
});

test("[PR-03, SV-C9] a 500 whose body is the fallback outcome renders the fallback surface", async ({
  page,
}) => {
  const messages = JSON.parse(readFileSync(FALLBACK, "utf8")) as unknown[];
  await openAgent(page);
  await page.route("**/api/prompt", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        contractVersion: CONTRACT_VERSION, // DEC-056: a server answer names its contract
        chatId: "x",
        status: "fallback",
        fallback: true,
        messages,
        text: "",
        errors: ["agent crashed"],
        attempts: 1,
        reason: "agent_error",
        durationMs: 5,
      }),
    }),
  );
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Не удалось построить интерфейс");
  await expect(
    preview(page).getByRole("heading", { name: "Не удалось построить интерфейс" }),
  ).toBeVisible();
  await expect(preview(page).getByRole("button", { name: "Повторить" })).toBeVisible();
});

test("[PR-03] a 500 without a JSON body, and a server that is down, give an error turn; the page stays usable", async ({
  page,
}) => {
  await openAgent(page);
  await page.route("**/api/prompt", (route) => route.fulfill({ status: 500, body: "oops" }));
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(lastTurn(page)).toContainText("http_500");
  await page.route("**/api/prompt", (route) => route.abort("connectionrefused"));
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(lastTurn(page)).toContainText("network");
  await page.unroute("**/api/prompt");
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Интерфейс готов");
  await expect(heading(page)).toBeVisible();
});

test("[SV-C20] a failed progress poll does not stop the polling: the repair attempt still shows", async ({
  page,
}) => {
  let polls = 0;
  await page.route("**/api/progress**", (route) =>
    ++polls === 1 ? route.fulfill({ status: 502, body: "bad gateway" }) : route.fallback(),
  );
  await openAgent(page);
  await sendPrompt(page, `${PROMPT} #repair`);
  const progress = page.getByTestId("agent-progress");
  await expect(progress.locator("summary")).toHaveText(
    "Попытка 1 не прошла проверку: 1 ошибка, исправляю (2 из 4)",
  );
  await expect(progress.getByText("non-existent component 'missing'")).toBeHidden();
  await progress.locator("summary").click();
  await expect(progress.getByText(/non-existent component 'missing'/)).toBeVisible();
  await expect(status(page)).toHaveText("Интерфейс готов");
});

test("[SV-C25] a model change the server refuses keeps the model and shows the reason", async ({
  page,
}) => {
  await openAgent(page);
  const select = page.getByRole("combobox", { name: "Модель" });
  const before = await select.textContent();
  await page.route("**/api/model", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: '{"error":"unknown_model","message":"no such model"}',
    }),
  );
  await select.click();
  await page.getByRole("option").last().click();
  await expect(page.getByTestId("model-error")).toHaveText("Модель не изменена: 400 no such model");
  await expect(select).toHaveText(before ?? "");
});

test("[SV-C20] a cancel the server does not apply re-enables Cancel", async ({ page }) => {
  await openAgent(page);
  await page.route("**/api/cancel", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ contractVersion: CONTRACT_VERSION, chatId: "x", cancelled: false }),
    }),
  );
  await sendPrompt(page, `${PROMPT} #hold`);
  const cancel = page.getByRole("button", { name: "Отменить" });
  await cancel.click();
  await expect(cancel).toBeEnabled();
  await expect(page.getByTestId("agent-working")).toContainText("Агент строит интерфейс…");
  await page.unroute("**/api/cancel");
  await cancel.click();
  await expect(page.getByTestId("agent-working")).toHaveCount(0, { timeout: 10_000 });
  await expect(status(page)).toHaveText("Отменено");
});
