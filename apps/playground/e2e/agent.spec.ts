import { expect, test } from "@playwright/test";
import { lastTurn, openAgent, preview, PROMPT, sendPrompt } from "./support/agent.ts";
import { watchConsole } from "./support/console.ts";

// Runs against the real agent server process (python -m agentic_ui_server) on the deterministic
// fake ACP agent e2e/agent/fake-agent.mjs; the tag in a prompt picks its scenario.

test("[P8-agent-page, SV-C13, SV-C12] a prompt renders the agent's valid UI with the examples' renderer and its data model", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openAgent(page);
  await expect(
    page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Agent" }),
  ).toHaveAttribute("aria-current", "page");
  const request = page.waitForRequest((r) => r.url().endsWith("/api/prompt"));
  await sendPrompt(page, PROMPT);
  expect((await request).postDataJSON()).toMatchObject({ text: PROMPT.trim() });
  await expect(page.getByTestId("agent-working")).toBeVisible();
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  await expect(lastTurn(page)).toContainText("попыток: 1");
  await expect(lastTurn(page)).toContainText("Интерфейс готов.");
  await expect(page.getByTestId("agent-working")).toHaveCount(0);
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
  await expect(preview(page).locator("[data-ui-kit-root]")).toBeAttached();
  await page.getByRole("tab", { name: /^Data model/ }).click();
  await expect(page.getByTestId("data-model-editor")).toHaveValue(/Заявка не отправлена/);
  console.expectClean();
});

test("[P8-agent-page, SV-C13] a button action goes to /action with the data model and the reply updates the UI", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
  await preview(page).getByRole("textbox", { name: "Имя" }).fill("Анна");
  const action = page.waitForRequest((r) => r.url().endsWith("/api/action"));
  await preview(page).getByRole("button", { name: "Отправить заявку" }).click();
  expect((await action).postDataJSON()).toMatchObject({
    surfaceId: "e2e-form",
    event: { name: "form.submit", context: { source: "e2e" } },
    dataModel: { form: { name: "Анна" } },
  });
  await expect(preview(page).getByText("Заявка принята: Анна")).toBeVisible();
  await expect(lastTurn(page).getByTestId("turn-request")).toContainText("form.submit");
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  await expect(preview(page).getByRole("textbox", { name: "Имя" })).toHaveValue("Анна");
  await page.getByRole("tab", { name: /^Events/ }).click();
  const names = page.getByTestId("event-name");
  await expect(names).toHaveText(["form.submit → ok", "form.submit", "prompt → ok"]);
  console.expectClean();
});

test("[SV-C20, SV-C13] the working message counts the time and Cancel stops the turn through /cancel", async ({
  page,
}) => {
  await openAgent(page);
  await sendPrompt(page, `${PROMPT} #hold`);
  const working = page.getByTestId("agent-working");
  await expect(working).toContainText("Агент строит интерфейс…");
  await expect(page.getByTestId("agent-elapsed")).toHaveText(/^[2-9] с$/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Отправить", exact: true })).toBeDisabled();
  const cancel = page.waitForResponse((r) => r.url().endsWith("/api/cancel"));
  await working.getByRole("button", { name: "Отменить" }).click();
  expect(await (await cancel).json()).toMatchObject({ cancelled: true });
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Отменено");
  await expect(working).toHaveCount(0);
});

test("[SV-C20, SV-C13] the optional progress endpoint shows the repair attempt and its errors; never the invalid draft", async ({
  page,
}) => {
  await openAgent(page);
  await sendPrompt(page, `${PROMPT} #repair`);
  const progress = page.getByTestId("agent-progress");
  await expect(progress.locator("summary")).toHaveText(
    "Попытка 1 не прошла проверку: 1 ошибка, исправляю (2 из 4)",
  );
  await expect(progress.getByText(/non-existent component 'missing'/)).toBeHidden(); // collapsed
  await progress.locator("summary").click();
  await expect(progress.getByText(/non-existent component 'missing'/)).toBeVisible();
  await expect(preview(page).getByRole("heading")).toHaveCount(0);
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  await expect(lastTurn(page)).toContainText("попыток: 2");
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
});

test("[SV-C20, SV-C13] without a progress endpoint (404) the page just waits for the valid UI", async ({
  page,
}) => {
  let polls = 0;
  await page.route("**/api/progress**", (route) => {
    polls += 1;
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: '{"error":"not_found","message":"no such endpoint"}',
    });
  });
  await openAgent(page);
  await sendPrompt(page, `${PROMPT} #repair`);
  await expect(page.getByTestId("agent-working")).toBeVisible();
  await expect(page.getByTestId("agent-elapsed")).toHaveText(/^[2-9] с$/, { timeout: 10_000 });
  await expect(page.getByTestId("agent-progress")).toHaveCount(0);
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  await expect(lastTurn(page)).toContainText("попыток: 2");
  // at most 3 answers without progress, then the page stops polling (packages/a2ui-react/tests/chat-turns.test.ts)
  expect(polls).toBeGreaterThanOrEqual(1);
  expect(polls).toBeLessThanOrEqual(3);
});

test("[P8-agent-page, SV-C13] after the repairs fail the fallback surface renders and Повторить re-sends the last prompt", async ({
  page,
}) => {
  await openAgent(page);
  await sendPrompt(page, `${PROMPT} #flaky`);
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText(
    "Не удалось построить интерфейс",
    { timeout: 20_000 },
  );
  await expect(lastTurn(page)).toContainText("попыток: 4");
  await expect(
    preview(page).getByRole("heading", { name: "Не удалось построить интерфейс" }),
  ).toBeVisible();
  const retry = page.waitForRequest((r) => r.url().endsWith("/api/prompt"));
  await preview(page).getByRole("button", { name: "Повторить" }).click();
  expect((await retry).postDataJSON()).toMatchObject({ text: `${PROMPT} #flaky` });
  await expect(page.getByTestId("chat-turn")).toHaveCount(2);
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
});

test("[SV-C25, SV-C13] the model dropdown lists the server's models and applies the choice to the chat", async ({
  page,
}) => {
  await openAgent(page);
  const select = page.getByRole("combobox", { name: "Модель" });
  await expect(select).toHaveText("model-a");
  await select.click();
  await expect(page.getByRole("option")).toHaveText([
    /^model-aModel A \(test endpoint\)$/,
    "model-b",
  ]);
  const chosen = page.waitForResponse((r) => r.url().endsWith("/api/model"));
  await page.getByRole("option", { name: "model-b" }).click();
  const response = await chosen;
  expect(response.request().postDataJSON()).toMatchObject({ model: "model-b(openai)" });
  expect(await response.json()).toMatchObject({ model: "model-b(openai)" });
  await expect(select).toHaveText("model-b");
  const { chatId } = response.request().postDataJSON() as { chatId: string };
  const models = await page.request.get(`/api/models?chatId=${encodeURIComponent(chatId)}`);
  expect(await models.json()).toMatchObject({ current: "model-b(openai)" });
  await sendPrompt(page, PROMPT);
  await expect(lastTurn(page).getByTestId("turn-result")).toContainText("· model-b");
});
