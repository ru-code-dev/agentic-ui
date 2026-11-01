import { CATALOG_ID } from "@agentic-ui/ui-kit-one-catalog";
import { CONTRACT_VERSION } from "../../src/core/contract-version.ts";

/** A valid surface: a Flex root with a Text and a Button (event `go`, data model sent). */
export function surface(surfaceId: string, text: string): unknown[] {
  return [
    { version: "v0.9", createSurface: { surfaceId, catalogId: CATALOG_ID, sendDataModel: true } },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId,
        components: [
          { id: "root", component: "Flex", direction: "column", children: ["t", "b"] },
          { id: "t", component: "Text", text },
          { id: "b", component: "Button", label: "Go", action: { event: { name: "go" } } },
        ],
      },
    },
    { version: "v0.9", updateDataModel: { surfaceId, path: "/", value: { n: 1 } } },
  ];
}

/** An in-place update of the Text of `surfaceId`. */
export const retext = (surfaceId: string, text: string): unknown[] => [
  {
    version: "v0.9",
    updateComponents: { surfaceId, components: [{ id: "t", component: "Text", text }] },
  },
];

export interface Outcome {
  readonly status?: "ok" | "fallback" | "cancelled";
  readonly text?: string;
  readonly messages?: readonly unknown[];
  readonly turnId?: string;
}

export interface Seen {
  readonly path: string;
  readonly body: Record<string, unknown> | undefined;
  readonly headers: Record<string, string>;
}

/**
 * A scripted server as a `fetch`: `/prompt` and `/action` answer the next scripted outcome (an outcome or a
 * function of the request body); every other endpoint answers what `optional` says (default 404 without JSON:
 * absent). Every answer carries this build's contractVersion.
 */
export function scriptedFetch(
  replies: (Outcome | ((body: Record<string, unknown>) => Outcome | Promise<Outcome>))[],
  optional: Record<string, (body: Record<string, unknown> | undefined) => [number, unknown]> = {},
) {
  const seen: Seen[] = [];
  const answer = (status: number, body: unknown) =>
    new Response(
      body === undefined
        ? "Not Found"
        : JSON.stringify({ ...(body as object), contractVersion: CONTRACT_VERSION }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://host");
    const path = url.pathname.replace(/^.*\//, "");
    const body =
      init?.body === undefined
        ? undefined
        : (JSON.parse(String(init.body)) as Record<string, unknown>);
    seen.push({ path, body, headers: { ...(init?.headers as Record<string, string>) } });
    if (path === "prompt" || path === "action") {
      const next = replies.shift();
      if (next === undefined) throw new Error(`no scripted reply for /${path}`);
      const outcome = typeof next === "function" ? await next(body ?? {}) : next;
      const status = outcome.status ?? "ok";
      return answer(200, {
        chatId: body?.["chatId"],
        status,
        messages: outcome.messages ?? [],
        text: outcome.text ?? "",
        fallback: status === "fallback",
        errors: [],
        attempts: 1,
        durationMs: 5,
        turnId: outcome.turnId ?? null,
      });
    }
    const handler = optional[path];
    if (handler === undefined) return answer(404, undefined);
    const [status, reply] = handler(body ?? Object.fromEntries(url.searchParams));
    return answer(status, reply);
  };
  return { fetch: fetch as typeof globalThis.fetch, seen };
}
