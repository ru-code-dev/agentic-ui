import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openIntegration, surface, turn } from "./support/integration.ts";

// Tier 4 (playwright.real.config.ts only): the Integration Full chat in Live mode on real qwen-code + the test LLM endpoint (SV-C17)
const LLM_ENV = fileURLToPath(new URL("../../../WORKFLOW/llm.env", import.meta.url));
const PROMPT =
  "Получатель: Анна Смирнова\nСумма: 1500\n\n" +
  "Покажи карточку перевода: имя получателя, сумму и кнопку «Перевести» с действием transfer.submit. " +
  "После нажатия обнови эту же карточку: покажи статус «Перевод отправлен».";

interface Answer {
  readonly status: string;
  readonly messages: readonly Record<string, unknown>[];
  readonly attempts: number;
  readonly durationMs: number;
}

test("[SV-C26, SV-C27] tier 4: Live Full chat on the real model: a prompt gives valid UI, one action updates the same surface", async ({
  page,
}) => {
  test.skip(
    !existsSync(LLM_ENV),
    "tier 4 needs WORKFLOW/llm.env (the machine's test LLM endpoint)",
  );
  await openIntegration(page, "full-chat");
  await page.getByRole("radio", { name: "Live" }).click();
  await expect(page.getByTestId("integration-demo")).toHaveAttribute("data-mode", "live");
  const prompted = page.waitForResponse((r) => r.url().endsWith("/api/prompt"), {
    timeout: 300_000,
  });
  await page.getByRole("textbox", { name: "Напишите, что показать…" }).fill(PROMPT);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  const first = (await (await prompted).json()) as Answer;
  await expect(turn(page, 0)).toHaveAttribute("data-state", "ui", { timeout: 30_000 });
  const shown = turn(page, 0).getByTestId("a2ui-surface").first();
  const surfaceId = await shown.getAttribute("data-surface-id");
  const acted = page.waitForResponse((r) => r.url().endsWith("/api/action"), { timeout: 300_000 });
  await shown
    .getByRole("button", { name: /Перевести/ })
    .first()
    .click();
  const second = (await (await acted).json()) as Answer;
  await expect(turn(page, 1)).toHaveAttribute("data-state", "ui", { timeout: 30_000 });
  const updated = await page.getByTestId("a2ui-surface").count();
  console.log(
    `tier4 integration: prompt ${first.status} attempts=${first.attempts} ${first.durationMs} ms; ` +
      `action ${second.status} attempts=${second.attempts} ${second.durationMs} ms; ` +
      `LLM calls ${first.attempts + second.attempts}; surface ${surfaceId}; surfaces after action ${updated}`,
  );
  expect([first.status, second.status]).toEqual(["ok", "ok"]);
  const targets = second.messages.map(
    (message) =>
      (Object.entries(message).find(([key]) => key !== "version")?.[1] as { surfaceId?: string })
        ?.surfaceId,
  );
  expect(second.messages.length).toBeGreaterThan(0);
  expect(new Set(targets)).toEqual(new Set([surfaceId])); // the action's reply changes only that surface
  expect(second.messages.some((message) => "createSurface" in message)).toBe(false);
  await expect(turn(page, 1).getByTestId("a2ui-surface")).toHaveCount(0); // nothing new was created
  // updated in place: the same surface, still under the turn that created it (anchored)
  await expect(turn(page, 0).locator(`[data-surface-id="${surfaceId}"]`)).toBeVisible();
  await expect(surface(page, surfaceId ?? "")).toHaveCount(1);
  expect(first.attempts + second.attempts).toBeLessThanOrEqual(4);
});
