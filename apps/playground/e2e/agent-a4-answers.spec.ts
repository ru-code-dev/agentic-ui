import { expect, test, type Page } from "@playwright/test";
import {
  CONTRACT_VERSION,
  form,
  fulfillJson,
  mockApi,
  openAgent,
  outcome,
  preview,
  PROMPT,
  sendPrompt,
  status,
} from "./support/agent-mock.ts";

// A4 review reproductions (WORKFLOW/review/a4-attack/attack/web/e2e/a4-*.spec.ts) and SV-C28: what
// the page does with answers it must not show, or shows only in part.

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
const banner = (page: Page) => page.locator(".bg-destructive\\/10");
const problem = (page: Page) => page.getByTestId("turn-problem").last();
const surfaceWith = (components: object[], data: unknown, surfaceId = "s-a4") => [
  { version: "v0.9", createSurface: { surfaceId, catalogId: CATALOG } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId,
      components: [
        {
          id: "root",
          component: "Flex",
          direction: "column",
          children: components.map((c) => (c as { id: string }).id),
        },
        ...components,
      ],
    },
  },
  { version: "v0.9", updateDataModel: { surfaceId, path: "/", value: data } },
];
const answer = (page: Page, ...replies: unknown[][]) => {
  let n = 0;
  const prompts: unknown[] = [];
  void page.route("**/api/prompt", (route) => {
    prompts.push(route.request().postDataJSON());
    return fulfillJson(route, outcome({ messages: replies[Math.min(n++, replies.length - 1)] }));
  });
  return prompts;
};

test("[A4-14] a function call that fails at evaluation is named in the banner, not a silent blank", async ({
  page,
}) => {
  await mockApi(page);
  const amount = { call: "formatCurrency", args: { value: { path: "/total" }, currency: "RUB" } };
  answer(
    page,
    surfaceWith(
      [
        { id: "label", component: "Text", text: "Итого:" },
        { id: "sum", component: "Text", text: amount },
      ],
      { total: "2780" },
    ),
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(preview(page).getByText("Итого:")).toBeVisible();
  await expect(banner(page)).toContainText("s-a4:");
});

test("[A4-26] a bound value of another type fails only its component: a placeholder, the rest stays", async ({
  page,
}) => {
  await mockApi(page);
  // A label bound to an object is refused by the page store (A5-01); an Avatar name bound to a number passes the
  // rules and fails to render.
  const button = {
    id: "pay",
    component: "Button",
    label: "Оплатить",
    action: { event: { name: "go" } },
  };
  answer(
    page,
    surfaceWith(
      [
        { id: "title", component: "Text", text: "Платёж" },
        button,
        { id: "who", component: "Avatar", name: { path: "/n" } },
      ],
      { n: 42 },
    ),
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(preview(page).getByText("Платёж")).toBeVisible();
  await expect(preview(page).getByText("Оплатить")).toBeVisible();
  await expect(preview(page).getByTestId("component-failed")).toHaveCount(1);
  await expect(page.getByTestId("render-failed")).toHaveCount(0);
  await expect(banner(page)).toContainText("Avatar «who»");
});

test("[SV-C28] a follow-up that updates a surface the chat never created is rejected; the shown surface stays", async ({
  page,
}) => {
  await mockApi(page);
  const ghost = [
    {
      version: "v0.9",
      updateComponents: {
        surfaceId: "ghost",
        components: [{ id: "root", component: "Text", text: "призрак" }],
      },
    },
  ];
  answer(page, form("Первая форма"), ghost);
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(preview(page).getByRole("heading", { name: "Первая форма" })).toBeVisible();
  await sendPrompt(page, "обнови");
  await expect(status(page)).toHaveText("Интерфейс отклонён страницей");
  await expect(problem(page).getByTestId("problem-details")).toContainText("ghost");
  await expect(preview(page).getByRole("heading", { name: "Первая форма" })).toBeVisible();
  await expect(preview(page).getByText("призрак")).toHaveCount(0);
});

/** A follow-up that re-points the form's root at its title and `child`, defining only "hint". */
const extend = (child: string) => [
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "e2e-form",
      components: [
        { id: "root", component: "Flex", direction: "column", children: ["title", child] },
        { id: "hint", component: "Text", text: "Подсказка" },
      ],
    },
  },
];

test("[SV-C28] a follow-up may name components an earlier reply defined; a dangling one is rejected", async ({
  page,
}) => {
  await mockApi(page);
  answer(page, form("Форма"), extend("hint"), extend("nowhere"));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await sendPrompt(page, "добавь подсказку");
  await expect(status(page)).toHaveText("Интерфейс готов");
  await expect(preview(page).getByText("Подсказка")).toBeVisible();
  await sendPrompt(page, "ещё");
  await expect(status(page)).toHaveText("Интерфейс отклонён страницей");
  await expect(problem(page).getByTestId("problem-details")).toContainText("nowhere");
  await expect(preview(page).getByText("Подсказка")).toBeVisible();
});

test("[A4-15, A4-23] «Повторить» under a rejected turn asks the agent again; the placeholder names POST /api/prompt", async ({
  page,
}) => {
  await mockApi(page);
  const broken = form();
  (
    broken[2] as { updateComponents: { components: { children?: string[] }[] } }
  ).updateComponents.components[0]!.children!.push("missing");
  const prompts = answer(page, broken);
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Интерфейс отклонён страницей");
  await expect(problem(page).getByTestId("problem-request")).toHaveText("POST /api/prompt");
  // DEC-063: the page first asks the agent once to repair; that answer is rejected again here
  await expect(page.getByTestId("repair-request")).toBeVisible();
  await expect(status(page)).toHaveText("Интерфейс отклонён страницей");
  expect(prompts).toHaveLength(2);
  const before = prompts.length;
  await page.getByRole("button", { name: "Повторить" }).last().click();
  await expect.poll(() => prompts.length).toBe(before + 1);
});

test("[A4-21] a /cancel answer of the wrong shape is a page notice with the details", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/prompt", () => {}); // never answers
  await page.route("**/api/cancel", (route) =>
    fulfillJson(route, { contractVersion: CONTRACT_VERSION, chatId: "x", cancelled: "yes" }),
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(page.getByTestId("agent-notice")).toContainText("POST /api/cancel");
});
