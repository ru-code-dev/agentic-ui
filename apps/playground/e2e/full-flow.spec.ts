import { expect, test } from "@playwright/test";
import { lastTurn, openAgent, preview, PROMPT, sendPrompt } from "./support/agent.ts";
import { watchConsole } from "./support/console.ts";

// P10 (DEC-033): one user journey through the whole stack: the /agent page → the real agent server
// process → the ACP agent (deterministic e2e/agent/fake-agent.mjs) → validated UI → actions with the
// data model → updates, then a second prompt in the same chat and a new chat. The renderer is the
// workspace's (runtime + transport seam); only the action sink is the network (PG-16).

test("[P10-e2e-full-flow, PG-16] prompt → valid UI → typed data model → two actions → second prompt → new chat", async ({
  page,
}) => {
  const console = watchConsole(page);
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ok", agentFound: true });

  await openAgent(page);
  await expect(page.getByText("Здесь появится интерфейс")).toBeVisible();
  const prompted = page.waitForResponse((r) => r.url().endsWith("/api/prompt"));
  await sendPrompt(page, PROMPT);
  const outcome = (await (await prompted).json()) as {
    chatId: string;
    status: string;
    fallback: boolean;
  };
  expect(outcome).toMatchObject({ status: "ok", fallback: false });
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
  await expect(page.getByText("Здесь появится интерфейс")).toHaveCount(0);

  // The user types: the data model follows live (Data model tab), before any request.
  await preview(page).getByRole("textbox", { name: "Имя" }).fill("Анна");
  await page.getByRole("tab", { name: /^Data model/ }).click();
  await expect(page.getByTestId("data-model-editor")).toHaveValue(/"name": "Анна"/);

  // First action: the event + the data model go to /action in the same chat; the reply patches the UI.
  const action = page.waitForRequest((r) => r.url().endsWith("/api/action"));
  await preview(page).getByRole("button", { name: "Отправить заявку" }).click();
  expect((await action).postDataJSON()).toMatchObject({
    chatId: outcome.chatId,
    surfaceId: "e2e-form",
    event: { name: "form.submit", context: { source: "e2e" } },
    dataModel: { form: { name: "Анна" } },
  });
  await expect(preview(page).getByText("Заявка принята: Анна")).toBeVisible();
  await expect(page.getByTestId("data-model-editor")).toHaveValue(/Заявка принята: Анна/);

  // Second action on the updated UI carries the new input.
  await preview(page).getByRole("textbox", { name: "Имя" }).fill("Борис");
  const second = page.waitForRequest((r) => r.url().endsWith("/api/action"));
  await preview(page).getByRole("button", { name: "Отправить заявку" }).click();
  expect((await second).postDataJSON()).toMatchObject({ dataModel: { form: { name: "Борис" } } });
  await expect(preview(page).getByText("Заявка принята: Борис")).toBeVisible();
  await page.getByRole("tab", { name: /^Events/ }).click();
  await expect(page.getByTestId("event-name")).toHaveText([
    "form.submit → ok",
    "form.submit",
    "form.submit → ok",
    "form.submit",
    "prompt → ok",
  ]);

  // A second prompt in the same chat renders a fresh UI (createSurface → clean render).
  const again = page.waitForRequest((r) => r.url().endsWith("/api/prompt"));
  await sendPrompt(page, "Покажи форму ещё раз.");
  expect((await again).postDataJSON()).toMatchObject({ chatId: outcome.chatId });
  await expect(page.getByTestId("chat-turn")).toHaveCount(4);
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  await expect(preview(page).getByRole("textbox", { name: "Имя" })).toHaveValue("");

  // A new chat starts empty with another chat id.
  await page.getByRole("button", { name: "Новый чат" }).click();
  await expect(page.getByTestId("chat-turn")).toHaveCount(0);
  await expect(page.getByText("Здесь появится интерфейс")).toBeVisible();
  const fresh = page.waitForRequest((r) => r.url().endsWith("/api/prompt"));
  await sendPrompt(page, PROMPT);
  expect((await fresh).postDataJSON().chatId).not.toBe(outcome.chatId);
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
  console.expectClean();
});
