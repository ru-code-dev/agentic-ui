/**
 * A3 review reproductions (A3-13..A3-21): the Agent page against a mocked /api (page.route), so a
 * test can send any answer a replacement backend or a proxy could send. Every mocked body carries
 * the contract version of the built page (DEC-056) unless a test removes or changes it.
 */
import { readFileSync } from "node:fs";
import { expect, type Page, type Route } from "@playwright/test";
import { contractVersionOf } from "../../../../packages/ui-kit-one-catalog/scripts/contract-version.ts";

const catalogPath = new URL(
  "../../../../packages/ui-kit-one-catalog/dist/catalog.json",
  import.meta.url,
);
/** The version the built page embeds (vite.config.ts computes it from the same file). */
export const CONTRACT_VERSION = contractVersionOf(readFileSync(catalogPath, "utf8"));
const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";

/**
 * A valid surface (the fake agent's form) with a heading of choice. It starts with a deleteSurface (a
 * no-op for a surface the chat does not show), so every prompt may answer it again (SV-C28).
 */
export function form(title = "Заявка на карту", surfaceId = "e2e-form"): unknown[] {
  return [
    { version: "v0.9", deleteSurface: { surfaceId } },
    { version: "v0.9", createSurface: { surfaceId, catalogId: CATALOG, sendDataModel: true } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId,
        components: [
          {
            id: "root",
            component: "Flex",
            direction: "column",
            gap: "3",
            children: ["title", "name", "send"],
          },
          { id: "title", component: "Heading", text: title, size: "md" },
          { id: "name", component: "Input", label: "Имя", value: { path: "/form/name" } },
          {
            id: "send",
            component: "Button",
            label: "Отправить заявку",
            action: { event: { name: "form.submit", context: { source: "e2e" } } },
          },
        ],
      },
    },
    { version: "v0.9", updateDataModel: { surfaceId, path: "/", value: { form: { name: "" } } } },
  ];
}

export const outcome = (over: Record<string, unknown> = {}) => ({
  contractVersion: CONTRACT_VERSION,
  chatId: "x",
  status: "ok",
  messages: form(),
  text: "Готово.",
  fallback: false,
  errors: [],
  attempts: 1,
  reason: null,
  durationMs: 10,
  ...over,
});

export const running = (over: Record<string, unknown> = {}) => ({
  contractVersion: CONTRACT_VERSION,
  chatId: "x",
  state: "running",
  attempt: 1,
  maxAttempts: 4,
  errors: [],
  errorCount: 0,
  elapsedMs: 500,
  ...over,
});

export const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export const MODELS = {
  contractVersion: CONTRACT_VERSION,
  models: [
    { id: "m-a", name: "Model A" },
    { id: "m-b", name: "Model B" },
  ],
  default: "m-a",
  current: "m-a",
};

/**
 * Mocks every /api endpoint (no real server). Defaults: models A/B, /model echoes, /progress 404,
 * /cancel cancelled:false, /prompt + /action answer a valid form. Later routes take precedence.
 */
export async function mockApi(page: Page, over: { models?: unknown } = {}) {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const chatId = String(
      (route.request().postDataJSON() as { chatId?: string } | null)?.chatId ?? "x",
    );
    switch (url.pathname) {
      case "/api/models":
        return fulfillJson(route, over.models ?? MODELS);
      case "/api/model": {
        const { model } = route.request().postDataJSON() as { model: string };
        return fulfillJson(route, { contractVersion: CONTRACT_VERSION, chatId, model });
      }
      case "/api/progress":
        return fulfillJson(route, { error: "not_found", message: "no" }, 404);
      case "/api/cancel":
        return fulfillJson(route, { contractVersion: CONTRACT_VERSION, chatId, cancelled: false });
      default:
        return fulfillJson(route, outcome({ chatId }));
    }
  });
}

export async function openAgent(page: Page, withModels = true) {
  await page.goto("/agent");
  if (withModels) await expect(page.getByRole("combobox", { name: "Модель" })).toBeVisible();
  else await expect(page.getByRole("textbox", { name: "Данные и инструкция" })).toBeVisible();
}

export async function sendPrompt(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Данные и инструкция" }).fill(text);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
}

export const lastTurn = (page: Page) => page.getByTestId("chat-turn").last();
export const status = (page: Page) => lastTurn(page).getByTestId("turn-status");
export const preview = (page: Page) => page.getByTestId("agent-preview");
export const working = (page: Page) => page.getByTestId("agent-working");
export const nav = (page: Page) => page.getByRole("navigation", { name: "Pages" });
export const PROMPT = "Имя,Карта\nАнна,Дебетовая\n\nПокажи форму заявки на карту.";

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
