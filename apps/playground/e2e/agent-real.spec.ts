import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lastTurn, openAgent, preview, sendPrompt } from "./support/agent.ts";

// Tier 4 (playwright.real.config.ts only): real qwen-code + the machine's test LLM endpoint behind the real server.
const LLM_ENV = fileURLToPath(new URL("../../../WORKFLOW/llm.env", import.meta.url));
const PROMPT =
  "Получатель: Анна Смирнова\nСумма: 1500\n\n" +
  "Покажи карточку перевода: имя получателя, поле суммы и кнопку «Перевести» с действием transfer.submit.";

test("[P8-agent-page, SV-C13, SV-C25, P10-e2e-full-flow] tier 4: the real model through the page builds a valid UI and answers one action", async ({
  page,
}) => {
  test.skip(
    !existsSync(LLM_ENV),
    "tier 4 needs WORKFLOW/llm.env (the machine's test LLM endpoint)",
  );
  await openAgent(page);
  // A non-empty model dropdown (the CLI lists whatever WORKFLOW/llm.env configured; the name is machine-local).
  await expect(page.getByRole("combobox", { name: "Модель" })).not.toBeEmpty();
  const prompted = page.waitForResponse((r) => r.url().endsWith("/api/prompt"), {
    timeout: 300_000,
  });
  await sendPrompt(page, PROMPT);
  const first = (await (await prompted).json()) as {
    status: string;
    attempts: number;
    durationMs: number;
  };
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  await expect(preview(page).locator("[data-ui-kit-root] *").first()).toBeVisible();
  const acted = page.waitForResponse((r) => r.url().endsWith("/api/action"), { timeout: 300_000 });
  await preview(page)
    .getByRole("button", { name: /Перевести/ })
    .first()
    .click();
  const second = (await (await acted).json()) as {
    status: string;
    attempts: number;
    durationMs: number;
  };
  await expect(lastTurn(page).getByTestId("turn-status")).toHaveText("Интерфейс готов");
  const calls = first.attempts + second.attempts;
  console.log(
    `tier4: prompt ${first.status} attempts=${first.attempts} ${first.durationMs} ms; ` +
      `action ${second.status} attempts=${second.attempts} ${second.durationMs} ms; LLM calls ${calls}`,
  );
  expect([first.status, second.status]).toEqual(["ok", "ok"]);
  expect(calls).toBeLessThanOrEqual(3);
});
