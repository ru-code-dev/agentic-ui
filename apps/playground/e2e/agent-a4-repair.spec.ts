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

// DEC-063: a reply the page rejects (its validator, an expression or a render error) goes back to the
// agent once as a repair turn in the same chat via /prompt with the exact errors; still invalid →
// placeholder + «Повторить».

const broken = () => {
  const messages = form() as { updateComponents?: { components: { children?: string[] }[] } }[];
  messages[2]!.updateComponents!.components[0]!.children!.push("missing");
  return messages;
};
function answer(page: Page, ...replies: unknown[][]) {
  const prompts: { chatId: string; text: string }[] = [];
  void page.route("**/api/prompt", (route) => {
    prompts.push(route.request().postDataJSON() as { chatId: string; text: string });
    return fulfillJson(
      route,
      outcome({ messages: replies[Math.min(prompts.length - 1, replies.length - 1)] }),
    );
  });
  return prompts;
}

test("[DEC-063] a reply the page validator rejects is sent back once with the exact errors; the repaired UI is shown", async ({
  page,
}) => {
  await mockApi(page);
  const prompts = answer(page, broken(), form("Исправленная форма"));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(page.getByTestId("repair-request")).toBeVisible();
  await expect(status(page)).toHaveText("Интерфейс готов");
  await expect(preview(page).getByRole("heading", { name: "Исправленная форма" })).toBeVisible();
  expect(prompts).toHaveLength(2);
  expect(prompts[1]!.chatId).toBe(prompts[0]!.chatId);
  expect(prompts[1]!.text).toContain("missing");
});

test("[DEC-063] a repair that is rejected again is not repaired twice: placeholder and «Повторить»", async ({
  page,
}) => {
  await mockApi(page);
  const prompts = answer(page, broken());
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(page.getByTestId("repair-request")).toBeVisible();
  await expect(status(page)).toHaveText("Интерфейс отклонён страницей");
  await page.waitForTimeout(1000);
  expect(prompts).toHaveLength(2);
  await expect(page.getByRole("button", { name: "Повторить" }).last()).toBeVisible();
});

test("[DEC-063, A4-26] a component that fails to render is reported to the agent once as a repair turn", async ({
  page,
}) => {
  await mockApi(page);
  // An Avatar name bound to a number fails to render (an object-bound label never reaches the renderer, A5-01).
  const failing = form() as {
    updateComponents?: { components: Record<string, unknown>[] };
    updateDataModel?: { value: Record<string, unknown> };
  }[];
  failing[2]!.updateComponents!.components[3] = {
    id: "send",
    component: "Avatar",
    name: { path: "/n" },
  };
  failing[3]!.updateDataModel!.value["n"] = 7;
  const prompts = answer(page, failing, form("Без ошибок"));
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(page.getByTestId("repair-request")).toBeVisible();
  await expect(preview(page).getByRole("heading", { name: "Без ошибок" })).toBeVisible();
  expect(prompts[1]!.text).toContain("Avatar «send»");
  expect(prompts).toHaveLength(2);
});
