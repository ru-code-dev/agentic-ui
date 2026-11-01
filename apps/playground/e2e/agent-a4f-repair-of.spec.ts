import { expect, test, type Page } from "@playwright/test";
import {
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

// DEC-064 (A4F-O1): the page's repair turn (DEC-063) names the rejected reply's `turnId` in
// `repairOf`; the server rolls its chat state back to before that reply, and a reply the page had
// shown (an expression or render error) is dropped from the page's surfaces too, so both check the
// repair against the same state.

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
/** A second surface (no deleteSurface first: valid only where "extra" is not shown yet). */
const extra = (title: string, broken: boolean) => [
  { version: "v0.9", createSurface: { surfaceId: "extra", catalogId: CATALOG } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "extra",
      components: [
        { id: "root", component: "Flex", direction: "column", children: ["head", "go"] },
        { id: "head", component: "Heading", text: title, size: "md" },
        // An Avatar name bound to a number fails at render time (the page store passes it; an object-bound
        // label would be refused before rendering, A5-01).
        broken
          ? { id: "go", component: "Avatar", name: { path: "/n" } }
          : { id: "go", component: "Button", label: "Дальше", action: { event: { name: "next" } } },
      ],
    },
  },
  {
    version: "v0.9",
    updateDataModel: { surfaceId: "extra", path: "/", value: { form: { a: 1 }, n: 3 } },
  },
];

type Sent = { chatId: string; text: string; repairOf?: string };
function answer(page: Page, ...replies: Record<string, unknown>[]) {
  const prompts: Sent[] = [];
  void page.route("**/api/prompt", (route) => {
    prompts.push(route.request().postDataJSON() as Sent);
    return fulfillJson(route, outcome(replies[Math.min(prompts.length - 1, replies.length - 1)]));
  });
  return prompts;
}

test("[DEC-064] a shown reply that fails to render: the repair names it in repairOf, the page drops it, the repaired UI is shown", async ({
  page,
}) => {
  await mockApi(page);
  const prompts = answer(
    page,
    { messages: form(), turnId: "t1" },
    { messages: extra("Сломано", true), turnId: "t2" },
    { messages: extra("Исправлено", false), turnId: "t3" },
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Интерфейс готов");
  await sendPrompt(page, "Добавь второй экран");
  await expect(page.getByTestId("repair-request")).toBeVisible();
  await expect(preview(page).getByRole("heading", { name: "Исправлено" })).toBeVisible();
  await expect(status(page)).toHaveText("Интерфейс готов");
  await expect(preview(page).getByRole("heading", { name: "Сломано" })).toHaveCount(0);
  await expect(preview(page).getByRole("heading", { name: "Заявка на карту" })).toBeVisible();
  expect(prompts.map((sent) => sent.repairOf)).toEqual([undefined, undefined, "t2"]);
  expect(prompts[2]!.text).toContain("Avatar «go»");
});

test("[DEC-064] a reply the page validator rejects: the repair sends repairOf; a server without turnId gets none", async ({
  page,
}) => {
  await mockApi(page);
  const dangling = form() as { updateComponents?: { components: { children?: string[] }[] } }[];
  dangling[2]!.updateComponents!.components[0]!.children!.push("missing");
  const prompts = answer(
    page,
    { messages: dangling, turnId: "t1" },
    { messages: form("Исправленная форма"), turnId: "t2" },
    { messages: dangling },
    { messages: form("Снова исправлено") },
  );
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(preview(page).getByRole("heading", { name: "Исправленная форма" })).toBeVisible();
  await sendPrompt(page, "Ещё раз");
  await expect(preview(page).getByRole("heading", { name: "Снова исправлено" })).toBeVisible();
  expect(prompts.map((sent) => sent.repairOf)).toEqual([undefined, "t1", undefined, undefined]);
  expect("repairOf" in prompts[3]!).toBe(false);
});
