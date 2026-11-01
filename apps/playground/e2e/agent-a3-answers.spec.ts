import { expect, test } from "@playwright/test";
import {
  CONTRACT_VERSION,
  form,
  fulfillJson,
  MODELS,
  mockApi,
  nav,
  openAgent,
  outcome,
  preview,
  PROMPT,
  sendPrompt,
  status,
} from "./support/agent-mock.ts";

// A3 review reproductions (WORKFLOW/review/attack/attack/playground/a3-outcome.spec.ts,
// a3-render-crash.real.spec.ts) and DEC-056: the page checks every answer before it uses it.

const problem = (page: import("@playwright/test").Page) => page.getByTestId("turn-problem").last();

test("[A3-14] a 200 outcome with an unknown status is an error placeholder, the app stays (A3-P01a)", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", (r) =>
    fulfillJson(r, outcome({ status: "partial", messages: [] })),
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(nav(page)).toBeVisible();
  await expect(problem(page).getByTestId("problem-request")).toHaveText("POST /api/prompt");
  await expect(problem(page).getByTestId("problem-status")).toHaveText("200");
  await expect(problem(page).getByTestId("problem-details")).toContainText('"status" must be');
});

test("[A3-14] a 200 ok outcome without errors is an error placeholder, the app stays (A3-P01b)", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", (r) => fulfillJson(r, { ...outcome(), errors: undefined }));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(nav(page)).toBeVisible();
  await expect(problem(page)).toContainText('"errors" is missing');
});

test("[A3-14] messages: null is reported as a bad server answer, not as network (A3-P01c)", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", (r) => fulfillJson(r, outcome({ messages: null })));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(page.getByTestId("turn-result")).not.toContainText("network");
  await problem(page).getByText("Ответ сервера (фрагмент)").click();
  await expect(problem(page).getByTestId("problem-excerpt")).toContainText('"messages":null');
});

test("[A3-14] a 500 JSON that is not an outcome keeps the server's message (A3-P01d)", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", (r) =>
    fulfillJson(r, { status: "error", message: "database unavailable" }, 500),
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(problem(page).getByTestId("problem-title")).toHaveText("database unavailable");
  await expect(problem(page).getByTestId("problem-status")).toHaveText("500");
});

// form() = [deleteSurface, createSurface, updateComponents, updateDataModel] (SV-C28)
const invalid: Record<string, (m: any[]) => unknown[]> = {
  "a child id that is never defined": (m) => {
    m[2].updateComponents.components[0].children.push("missing");
    return m;
  },
  "an unknown component": (m) => {
    m[2].updateComponents.components[1].component = "Bogus";
    return m;
  },
  "no root component": (m) => {
    m[2].updateComponents.components[0].id = "notroot";
    return m;
  },
};
for (const [name, mutate] of Object.entries(invalid)) {
  test(`[A3-15] an ok outcome with ${name} is never rendered and never "Интерфейс готов" (A3-P02)`, async ({
    page,
  }) => {
    await mockApi(page);
    await page.route("**/api/prompt", (r) =>
      fulfillJson(r, outcome({ messages: mutate(form() as any[]) })),
    );
    await openAgent(page);
    await sendPrompt(page, PROMPT);
    await expect(status(page)).toHaveText("Интерфейс отклонён страницей");
    await expect(problem(page)).toHaveAttribute("data-kind", "invalid-ui");
    await expect(preview(page)).not.toContainText("[Loading");
    await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toHaveCount(0);
  });
}

test("[A3-13] a Table with locale ru_RU never blanks the playground (A3-P08, mocked answer)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const table = [
    {
      version: "v0.9",
      createSurface: { surfaceId: "t", catalogId: "urn:agentic-ui:catalog:ui-kit-one:v1" },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "t",
        components: [
          {
            id: "root",
            component: "Table",
            rows: { path: "/rows" },
            locale: "ru_RU",
            columns: [{ header: "Сумма", key: "a", format: "number" }],
          },
        ],
      },
    },
    { version: "v0.9", updateDataModel: { surfaceId: "t", path: "/rows", value: [{ a: 1250 }] } },
  ];
  await mockApi(page);
  await page.route("**/api/prompt", (r) => fulfillJson(r, outcome({ messages: table })));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Интерфейс отклонён страницей");
  await expect(problem(page)).toContainText("locale");
  await expect(nav(page)).toBeVisible();
  await expect(page.getByTestId("chat-turn")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("[DEC-056] matching contract versions: the answer renders", async ({ page }) => {
  await mockApi(page);
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Интерфейс готов");
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
});

test("[DEC-056] a server with another contract version: placeholder with both versions, nothing rendered", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", (r) =>
    fulfillJson(r, outcome({ contractVersion: "urn:other sha256:000000000000" })),
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(problem(page).getByTestId("problem-title")).toHaveText(
    `Версия контракта сервера urn:other sha256:000000000000 ≠ версии страницы ${CONTRACT_VERSION} — обновите одну из сторон`,
  );
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toHaveCount(0);
});

test("[DEC-056] an answer without contractVersion: placeholder, nothing rendered; /models too", async ({
  page,
}) => {
  const { contractVersion: _drop, ...bare } = outcome();
  const { contractVersion: _also, ...models } = MODELS;
  await mockApi(page, { models });
  await page.route("**/api/prompt", (r) => fulfillJson(r, bare));
  await openAgent(page, false);
  await expect(page.getByTestId("agent-notice")).toContainText(
    "Версия контракта сервера не указана",
  );
  await expect(page.getByRole("combobox", { name: "Модель" })).toHaveCount(0);
  await sendPrompt(page, PROMPT);
  await expect(problem(page).getByTestId("problem-title")).toHaveText(
    `Версия контракта сервера не указана ≠ версии страницы ${CONTRACT_VERSION} — обновите одну из сторон`,
  );
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toHaveCount(0);
});
