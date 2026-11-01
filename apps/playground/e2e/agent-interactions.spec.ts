import { expect, test } from "@playwright/test";
import { lastTurn, openAgent, preview, PROMPT, sendPrompt } from "./support/agent.ts";
import { watchConsole } from "./support/console.ts";

// Agent page composer, panels and timer by real interaction (A2 review, PR-03), on the real agent
// server with the fake ACP agent.

const box = (page: import("@playwright/test").Page) =>
  page.getByRole("textbox", { name: "Данные и инструкция" });
const sendButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Отправить", exact: true });

test("[PR-03, P8-agent-page] composer: empty prompt cannot be sent, Пример fills it, Ctrl+Enter sends once", async ({
  page,
}) => {
  const console = watchConsole(page);
  await openAgent(page);
  await expect(sendButton(page)).toBeDisabled();
  await box(page).fill("   \n  ");
  await expect(sendButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Пример" }).click();
  await expect(box(page)).toHaveValue(/итоговой суммой/);
  await box(page).press("Enter"); // plain Enter is a newline
  await expect(page.getByTestId("chat-turn")).toHaveCount(0);
  const prompts: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/prompt")) prompts.push(r.url());
  });
  await box(page).press("Control+Enter");
  await expect(page.getByTestId("agent-working")).toBeVisible();
  await expect(box(page)).toHaveValue("");
  await expect(sendButton(page)).toBeDisabled();
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  expect(prompts).toHaveLength(1);
  console.expectClean();
});

test("[PR-03, P8-agent-page] a double click on Отправить sends one request", async ({ page }) => {
  await openAgent(page);
  const prompts: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/prompt")) prompts.push(r.url());
  });
  await box(page).fill(PROMPT);
  await sendButton(page).dblclick();
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  expect(prompts).toHaveLength(1);
  await expect(page.getByTestId("chat-turn")).toHaveCount(1);
});

test("[PR-03, PG-10] the Data model tab applies an edit to the agent's UI; Events Clear empties the log", async ({
  page,
}) => {
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
  await page.getByRole("tab", { name: /^Data model/ }).click();
  const editor = page.getByTestId("data-model-editor");
  await editor.fill('{"form":{"name":"Борис"},"result":"Заявка не отправлена"}');
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(preview(page).getByRole("textbox", { name: "Имя" })).toHaveValue("Борис");
  const action = page.waitForRequest((r) => r.url().endsWith("/api/action"));
  await preview(page).getByRole("button", { name: "Отправить заявку" }).click();
  expect((await action).postDataJSON()).toMatchObject({ dataModel: { form: { name: "Борис" } } });
  await expect(preview(page).getByText("Заявка принята: Борис")).toBeVisible();
  await page.getByRole("tab", { name: /^Events/ }).click();
  await expect(page.getByTestId("event-name")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("event-name")).toHaveCount(0);
});

test("[SV-C20, PR-03] the working timer runs past a minute and Cancel shows Отменяю… then Отменено", async ({
  page,
}) => {
  await page.clock.install();
  await openAgent(page);
  await sendPrompt(page, `${PROMPT} #hold`);
  await expect(page.getByTestId("agent-working")).toBeVisible();
  await page.clock.fastForward("01:05");
  await expect(page.getByTestId("agent-elapsed")).toHaveText(/^1 мин 0[5-9] с$/);
  await expect(page.getByRole("button", { name: "Пример" })).toBeDisabled();
  await page.clock.resume();
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(page.getByTestId("agent-working")).toContainText("Отменяю…");
  await expect(page.getByTestId("agent-working")).toHaveCount(0, { timeout: 10_000 });
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Отменено");
  await box(page).fill(PROMPT);
  await expect(sendButton(page)).toBeEnabled();
});
