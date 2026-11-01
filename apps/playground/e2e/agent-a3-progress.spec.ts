import { expect, test, type Page } from "@playwright/test";
import {
  fulfillJson,
  mockApi,
  openAgent,
  PROMPT,
  running,
  sendPrompt,
  status,
  working,
} from "./support/agent-mock.ts";

// A3 review reproductions (WORKFLOW/review/attack/attack/playground/a3-progress.spec.ts).

/** Five finished turns, then a long one; returns the history's scroll container. */
async function longChat(page: Page, progress: boolean) {
  await mockApi(page);
  await openAgent(page);
  for (let i = 0; i < 5; i += 1) {
    await sendPrompt(page, `${PROMPT}\n`.repeat(4) + i);
    await expect(page.getByTestId("turn-status")).toHaveCount(i + 1);
  }
  await page.route("**/api/prompt", () => {}); // a long turn
  if (progress) await page.route("**/api/progress**", (r) => fulfillJson(r, running()));
  await sendPrompt(page, PROMPT);
  await expect(working(page)).toBeVisible();
  await page.waitForTimeout(1300); // first poll answered
  return page.getByTestId("chat-history").evaluateHandle((el) => {
    let node: HTMLElement | null = el.parentElement;
    while (node && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
    return node!;
  });
}

test("[A3-18] without a progress endpoint (404) the scroll position is kept (A3-P06-control)", async ({
  page,
}) => {
  const history = await longChat(page, false);
  await history.evaluate((n) => n.scrollTo({ top: 0 }));
  await page.waitForTimeout(2500);
  expect(await history.evaluate((n) => n.scrollTop)).toBe(0);
});

test("[A3-18] progress polls do not pull a reader back to the end of the chat (A3-P06)", async ({
  page,
}) => {
  const history = await longChat(page, true);
  const metrics = await history.evaluate((n) => ({ sh: n.scrollHeight, ch: n.clientHeight }));
  expect(metrics.sh).toBeGreaterThan(metrics.ch + 200); // there is history to scroll back to
  await history.evaluate((n) => n.scrollTo({ top: 0 }));
  await page.waitForTimeout(2500); // two more polls
  expect(
    await history.evaluate((n) => n.scrollTop),
    "the history was scrolled back to the end",
  ).toBe(0);
});

test("[A3-19] a repeated request does not show the repair attempts of the one a proxy 504 cut off (A3-P07)", async ({
  page,
}) => {
  await mockApi(page);
  await openAgent(page);
  await page.route("**/api/prompt", (r) =>
    r.fulfill({
      status: 504,
      contentType: "text/html",
      body: "<html><body>504 Gateway Time-out</body></html>",
    }),
  );
  await sendPrompt(page, PROMPT);
  await expect(status(page)).toHaveText("Ошибка запроса");
  await expect(page.getByTestId("turn-problem").getByTestId("problem-status")).toHaveText("504");
  // The server is still repairing the first request (90 s old, attempt 3 of 4).
  await page.route("**/api/progress**", (r) =>
    fulfillJson(
      r,
      running({
        state: "repairing",
        attempt: 3,
        errorCount: 2,
        errors: ["a", "b"],
        elapsedMs: 90_000,
      }),
    ),
  );
  await page.route("**/api/prompt", () => {}); // the repeated request is queued on the server
  await page.getByTestId("chat-turn").last().getByRole("button", { name: "Повторить" }).click();
  await expect(working(page)).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("agent-progress")).toHaveCount(0);
});
