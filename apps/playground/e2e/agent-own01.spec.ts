import { expect, test } from "@playwright/test";
import { mockApi, nav, openAgent, PROMPT, sendPrompt, status } from "./support/agent-mock.ts";

// OWN-01 (owner, 867c5dc): "Uncaught TypeError: destroy is not a function at ChatHistory" turned the whole app
// black in a browser whose scroll methods return a Promise. Both browser behaviours are forced here.

test("[OWN-01] a Promise-returning scrollIntoView never crashes the chat across turns", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Element.prototype.scrollIntoView = function () {
      return Promise.resolve() as unknown as undefined;
    };
  });
  await mockApi(page);
  await openAgent(page);
  for (let i = 0; i < 3; i += 1) {
    await sendPrompt(page, `${PROMPT} ${i}`);
    await expect(page.getByTestId("turn-status")).toHaveCount(i + 1);
  }
  await expect(status(page)).toHaveText("Интерфейс готов");
  await page.getByRole("button", { name: "Новый чат" }).click();
  await expect(page.getByTestId("chat-turn")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("[OWN-01, A3-13] a throw inside the chat's effects is a placeholder next to the sidebar, never a black page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.scrollIntoView = function () {
      throw new TypeError("destroy is not a function (forced)");
    };
  });
  await mockApi(page);
  await openAgent(page);
  await sendPrompt(page, PROMPT);
  await expect(page.getByTestId("route-failed")).toContainText(
    "destroy is not a function (forced)",
  );
  await expect(nav(page)).toBeVisible();
  await nav(page).getByRole("link", { name: "Components" }).click();
  await expect(page).toHaveURL(/\/components$/);
  await expect(page.getByTestId("route-failed")).toHaveCount(0);
});
