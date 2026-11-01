import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  CONTRACT_VERSION,
  fulfillJson,
  mockApi,
  openAgent,
  outcome,
  preview,
  PROMPT,
  sendPrompt,
  status,
} from "./support/agent-mock.ts";

async function choose(page: import("@playwright/test").Page, name: string) {
  await select(page).click();
  await page.getByRole("option", { name }).click();
}

// A4 review reproductions (WORKFLOW/review/a4-attack/attack/web/e2e/a4-stuck.spec.ts, a4-hang-body,
// a4-preview-route, a4-datamodel-edit): ways the page used to get stuck or blame the server.

const send = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Отправить", exact: true });
const select = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: "Модель" });

test("[A4-16] a POST /model that never answers times out: the lock clears and the error is shown", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await mockApi(page);
  await page.route("**/api/model", () => {}); // stalls forever
  await openAgent(page);
  await choose(page, "Model B");
  await expect(send(page)).toBeDisabled();
  await expect(page.getByText(/Модель не изменена/)).toBeVisible({ timeout: 25_000 });
  await page.getByRole("textbox", { name: "Данные и инструкция" }).fill(PROMPT);
  await expect(send(page)).toBeEnabled();
});

test("[A4-19] leaving /agent and coming back while POST /model runs keeps the lock", async ({
  page,
}) => {
  await mockApi(page);
  let release: (() => void) | undefined;
  await page.route("**/api/model", (route) => {
    release = () =>
      void fulfillJson(route, { contractVersion: CONTRACT_VERSION, chatId: "x", model: "m-b" });
  });
  await openAgent(page);
  await choose(page, "Model B");
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link").first().click();
  await page.goBack();
  await page.getByRole("textbox", { name: "Данные и инструкция" }).fill(PROMPT);
  await expect(send(page)).toBeDisabled();
  release?.();
  await expect(send(page)).toBeEnabled();
  await expect(select(page)).toHaveText(/Model B/);
});

test("[A4-22] a body that stalls mid-way: giving up ends the turn as cancelled, not as «не JSON»", async ({
  page,
}) => {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"status":"ok","messa'); // headers and half a body, then nothing
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  try {
    await mockApi(page);
    await page.route("**/api/prompt", (route) =>
      route.continue({ url: `http://127.0.0.1:${port}/` }),
    );
    await openAgent(page);
    await sendPrompt(page, PROMPT);
    await page.getByRole("button", { name: "Отменить" }).click();
    await expect(page.getByTestId("cancel-unconfirmed")).toBeVisible();
    await page.getByRole("button", { name: "Отменить" }).click();
    await expect(status(page)).toHaveText("Отменено");
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("[A4-17] a broken /preview share link is reported on the page instead of a white page", async ({
  page,
}) => {
  for (const hash of ["#not-base64!!", "#AAAA", "#q1YqSUxPLVKyMjTQUcrJz0vVKy5JLCkF8hNTUoqUagE"]) {
    await page.goto(`preview${hash}`);
    await expect(page.getByTestId("preview-root")).toBeAttached();
    await expect(page.getByTestId("preview-error")).toContainText("Ссылка на превью повреждена");
  }
});

test("[A4-20] a Data model edit that is not an object is refused in the panel; the next server reply is not blamed", async ({
  page,
}) => {
  await mockApi(page);
  const reply = [
    {
      version: "v0.9",
      updateDataModel: { surfaceId: "e2e-form", path: "/form/name", value: "OK" },
    },
  ];
  await page.route("**/api/action", (route) => fulfillJson(route, outcome({ messages: reply })));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Интерфейс готов");
  await page.getByRole("tab", { name: /Data model/ }).click();
  const editor = page.getByRole("textbox", { name: /Data model of/ });
  for (const edit of ["123", "[1,2,3]", '"текст"', "null"]) {
    await editor.fill(edit);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Корень модели данных должен быть JSON-объектом")).toBeVisible();
  }
  await preview(page).getByRole("button", { name: "Отправить заявку" }).click();
  await expect(status(page)).toHaveText("Интерфейс готов");
  await expect(preview(page).getByRole("textbox", { name: "Имя" })).toHaveValue("OK");
});
