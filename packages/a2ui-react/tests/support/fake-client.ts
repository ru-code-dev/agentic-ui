import { expect, vi } from "vite-plus/test";
import { CATALOG_ID } from "@agentic-ui/ui-kit-one-catalog";
import type { AgentClient, Outcome } from "../../src/core/client.ts";
import { AgentRequestError } from "../../src/core/responses.ts";

/** A surface the chat's check accepts (createSurface + a root Text). */
export const textSurface = (id: string, text = "Готово") => [
  { version: "v0.9", createSurface: { surfaceId: id, catalogId: CATALOG_ID } },
  {
    version: "v0.9",
    updateComponents: { surfaceId: id, components: [{ id: "root", component: "Text", text }] },
  },
];

export const outcome = (over: Partial<Outcome> = {}): Outcome => ({
  chatId: "x",
  status: "ok",
  messages: textSurface("s1"),
  text: "Готово",
  fallback: false,
  errors: [],
  attempts: 1,
  durationMs: 1,
  ...over,
});

/** An AgentClient whose calls answer `outcome()` unless overridden. */
export const fakeClient = (over: Partial<AgentClient> = {}): AgentClient => ({
  prompt: vi.fn(async () => outcome()),
  action: vi.fn(async () => outcome()),
  cancel: vi.fn(async () => true),
  progress: vi.fn(async () => undefined),
  models: vi.fn(async () => undefined),
  setModel: vi.fn(async (_chat: string, model: string) => model),
  ...over,
});

/** An HTTP error answer as the client reports it (message `<status> <title>`). */
export const httpFailure = (status: number, title: string, request = "POST /api/prompt") =>
  new AgentRequestError({
    kind: "http",
    request,
    httpStatus: status,
    title,
    details: [],
    excerpt: "",
  });

/** A request that never answers; aborting it rejects like the real client (kind timeout). */
export const hanging = (_chat: string, _text: unknown, signal?: AbortSignal) =>
  new Promise<Outcome>((_, reject) =>
    signal?.addEventListener("abort", () =>
      reject(
        new AgentRequestError({
          kind: "timeout",
          request: "POST /api/prompt",
          httpStatus: undefined,
          title: "запрос прерван страницей",
          details: [String(signal.reason)],
          excerpt: "",
        }),
      ),
    ),
  );

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

export const until = (check: () => boolean) => vi.waitFor(() => expect(check()).toBe(true));

export const MODELS = {
  models: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  default: "a",
  current: "a",
};
