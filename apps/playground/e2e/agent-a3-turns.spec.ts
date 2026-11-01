import { expect, test, type Page } from "@playwright/test";
import {
  CONTRACT_VERSION,
  deferred,
  fulfillJson,
  lastTurn,
  mockApi,
  openAgent,
  outcome,
  PROMPT,
  running,
  sendPrompt,
  status,
  working,
} from "./support/agent-mock.ts";

// A3 review reproductions (WORKFLOW/review/attack/attack/playground/a3-stuck.spec.ts, a3-model.spec.ts,
// a3-guards.spec.ts): a way out of a stuck turn, the model selector's truth, the M1/M2 guards.

const select = (page: Page) => page.getByRole("combobox", { name: "Модель" });

test("[A3-16] Cancel gets the user out of a turn whose request never answers when /cancel fails (A3-P03)", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", () => {}); // never answers
  await page.route("**/api/cancel", (r) => r.abort("connectionrefused"));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(working(page)).toBeVisible();
  const cancel = page.getByRole("button", { name: "Отменить" });
  await cancel.click();
  await expect(cancel).toBeEnabled();
  await expect(page.getByTestId("cancel-unconfirmed")).toBeVisible();
  await cancel.click();
  await expect(working(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(status(page)).toHaveText("Отменено");
  await expect(page.getByRole("button", { name: "Новый чат" })).toBeEnabled();
});

test("[A3-17] after a failed /model in a new chat the dropdown and turns show the server's model (A3-P05a)", async ({
  page,
}) => {
  await mockApi(page);
  await openAgent(page);
  await select(page).click();
  await page.getByRole("option", { name: "Model B" }).click();
  await expect(select(page)).toHaveText("Model B");
  await page.route("**/api/model", (r) => r.abort("connectionrefused"));
  await page.getByRole("button", { name: "Новый чат" }).click();
  await expect(page.getByTestId("model-error")).toBeVisible();
  await expect(select(page)).toHaveText("Model A");
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Интерфейс готов");
  await expect(lastTurn(page).getByTestId("turn-result")).not.toContainText("Model B");
  await expect(lastTurn(page).getByTestId("turn-result")).toContainText("Model A");
});

test("[A3-17] a prompt is never sent before POST /model is answered (A3-P05b)", async ({
  page,
}) => {
  await mockApi(page);
  await openAgent(page);
  const release = deferred();
  const order: string[] = [];
  await page.route("**/api/model", async (r) => {
    order.push("model:request");
    await release.promise;
    order.push("model:answered");
    await fulfillJson(r, { contractVersion: CONTRACT_VERSION, chatId: "x", model: "m-b" });
  });
  page.on("request", (r) => {
    if (r.url().endsWith("/api/prompt")) order.push("prompt:request");
  });
  await select(page).click();
  await page.getByRole("option", { name: "Model B" }).click();
  await page.getByRole("textbox", { name: "Данные и инструкция" }).fill(PROMPT);
  const send = page.getByRole("button", { name: "Отправить", exact: true });
  await expect(send).toBeDisabled();
  release.resolve();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(status(page)).toHaveText("Интерфейс готов");
  expect(order).toEqual(["model:request", "model:answered", "prompt:request"]);
  await expect(lastTurn(page).getByTestId("turn-result")).toContainText("Model B");
});

test("[A3-20] a /cancel that fails on the network re-enables Cancel, no stuck Отменяю… (A3-T01, mutant M1)", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", async (r) => {
    await new Promise((done) => setTimeout(done, 4000));
    await fulfillJson(r, outcome({ status: "cancelled", messages: [] }));
  });
  await page.route("**/api/cancel", (r) => r.abort("connectionrefused"));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  const cancel = page.getByRole("button", { name: "Отменить" });
  await cancel.click();
  await expect(cancel).toBeEnabled({ timeout: 2000 });
  await expect(working(page)).toContainText("Агент строит интерфейс…");
});

test("[A3-21] three failed progress polls in a row (502) do not stop the polling (A3-T02, mutant M2)", async ({
  page,
}) => {
  await mockApi(page);
  let polls = 0;
  await page.route("**/api/progress**", (r) =>
    ++polls <= 3
      ? r.fulfill({ status: 502, body: "bad gateway" })
      : fulfillJson(r, running({ state: "repairing", attempt: 2, errors: ["e"], errorCount: 1 })),
  );
  await page.route("**/api/prompt", async (r) => {
    await new Promise((done) => setTimeout(done, 6500));
    await fulfillJson(r, outcome({ messages: [], attempts: 2 }));
  });
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(page.getByTestId("agent-progress")).toBeVisible({ timeout: 6000 });
  // SV-C27: this reply has no messages, a text-only turn (PKG-B: its own badge)
  await expect(status(page)).toHaveText("Ответ текстом", { timeout: 10_000 });
});
