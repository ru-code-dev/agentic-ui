import { expect, test, type Page } from "@playwright/test";
import { mockApi, openAgent } from "./support/agent-mock.ts";
import { openPanel, openWorkspace, previewFrame } from "./support/workspace.ts";

// A4-13 (WORKFLOW/review/a4-attack/attack/web/e2e/a4-insecure-origin.spec.ts): plain http from a LAN host
// is not a secure context, so `crypto.randomUUID` is undefined there. The e2e server is loopback (a
// secure context), so the script removes the API before any page script runs, like such a host.
async function insecure(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Crypto.prototype, "randomUUID");
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("[A4-13] without crypto.randomUUID /agent opens with its composer, no route-failed placeholder", async ({
  page,
}) => {
  const errors = await insecure(page);
  await mockApi(page);
  await openAgent(page);
  expect(await page.evaluate(() => "randomUUID" in crypto)).toBe(false);
  await expect(page.getByRole("textbox", { name: "Данные и инструкция" })).toBeVisible();
  await expect(page.getByTestId("route-failed")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("[A4-13] without crypto.randomUUID /preview and the workspace preview render, a mock rule can be added", async ({
  page,
}) => {
  const errors = await insecure(page);
  await page.goto("preview");
  await expect(page.getByTestId("preview-root")).toBeAttached();
  await openWorkspace(page);
  await expect(previewFrame(page).getByTestId("preview-root")).toBeAttached();
  await openPanel(page, /Mock rules/);
  const before = await page.getByTestId("mock-rule").count();
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByTestId("mock-rule")).toHaveCount(before + 1);
  expect(errors).toEqual([]);
});
