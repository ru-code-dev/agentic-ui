import { CONTRACT_VERSION } from "@agentic-ui/a2ui-react/core";

/** What the scripted agent is asked: a user message or a surface action (with the surface's data model). */
export type ScriptRequest =
  | { readonly kind: "prompt"; readonly text: string }
  | {
      readonly kind: "action";
      readonly name: string;
      readonly surfaceId: string;
      readonly context: unknown;
      readonly dataModel: unknown;
    };

/** Its reply: the text always (SV-C27), A2UI messages when the turn needs UI; `fallback` = UI failed. */
export interface ScriptReply {
  readonly text: string;
  readonly messages?: readonly unknown[];
  readonly status?: "ok" | "fallback";
  /** The request fails with this HTTP status (the page shows an error turn). */
  readonly failure?: number;
  /** This reply takes longer than the server's default (time to press Cancel). */
  readonly delayMs?: number;
}

/** A deterministic agent: the same request (in the same chat state) always gets the same reply. */
export type Script = (request: ScriptRequest) => ScriptReply;

export interface ScriptedServerOptions {
  /** false: only /prompt and /action exist (a minimal server, SV-C26); default true. */
  readonly optional?: boolean;
  /** How long a reply takes (the working state is visible). */
  readonly delayMs?: number;
}

const MODELS = [
  { id: "scripted", name: "Сценарий", description: "встроенный агент без сервера и LLM" },
  { id: "scripted-slow", name: "Сценарий (медленно)" },
];

const json = (status: number, body: object) =>
  new Response(JSON.stringify({ contractVersion: CONTRACT_VERSION, ...body }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const requestOf = (endpoint: string, body: Record<string, unknown>): ScriptRequest =>
  endpoint === "prompt"
    ? { kind: "prompt", text: String(body["text"] ?? "") }
    : {
        kind: "action",
        name: String((body["event"] as { name?: unknown } | undefined)?.name ?? ""),
        surfaceId: String(body["surfaceId"] ?? ""),
        context: (body["event"] as { context?: unknown } | undefined)?.context,
        dataModel: body["dataModel"],
      };

/**
 * The Scripted mode of the Integration pages: an agent server inside the browser, as a `fetch` for
 * `createAgentClient` (so the real client, its response checks and the contract version run). `/prompt` and
 * `/action` ask the script; with `optional`, `/models`, `/model`, `/progress` and `/cancel` answer like the
 * reference server; without, they are 404 (absent).
 */
export function scriptedServer(
  script: Script,
  { optional = true, delayMs = 500 }: ScriptedServerOptions = {},
): typeof globalThis.fetch {
  let model = MODELS[0]?.id ?? "";
  let running: { startedAt: number; cancel: () => void } | undefined;
  const reply = async (endpoint: string, body: Record<string, unknown>, signal?: AbortSignal) => {
    const startedAt = Date.now();
    const scripted = script(requestOf(endpoint, body));
    const wait = scripted.delayMs ?? (model === "scripted-slow" ? delayMs * 4 : delayMs);
    const cancelled = await new Promise<boolean>((done, fail) => {
      const timer = setTimeout(() => done(false), wait);
      running = {
        startedAt,
        cancel: () => {
          clearTimeout(timer);
          done(true);
        },
      };
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        fail(new DOMException("The operation was aborted.", "AbortError"));
      });
    }).finally(() => (running = undefined));
    if (scripted.failure !== undefined && !cancelled)
      return json(scripted.failure, { error: "unavailable", message: scripted.text });
    const answer = cancelled ? { text: "Отменено.", messages: [] } : scripted;
    const status = cancelled ? "cancelled" : (answer.status ?? "ok");
    return json(200, {
      chatId: String(body["chatId"] ?? ""),
      status,
      messages: answer.messages ?? [],
      text: answer.text,
      fallback: status === "fallback",
      errors: status === "fallback" ? ["сценарий: интерфейс не построен"] : [],
      attempts: status === "fallback" ? 4 : 1,
      reason: status === "fallback" ? "attempts_exhausted" : null,
      durationMs: Date.now() - startedAt,
    });
  };
  return async (input, init) => {
    const url = new URL(String(input), "http://scripted");
    const endpoint = url.pathname.split("/").at(-1) ?? "";
    const body = (init?.body === undefined ? {} : JSON.parse(String(init.body))) as Record<
      string,
      unknown
    >;
    const chatId = String(body["chatId"] ?? url.searchParams.get("chatId") ?? "");
    if (endpoint === "prompt" || endpoint === "action")
      return reply(endpoint, body, init?.signal ?? undefined);
    if (!optional) return new Response("Not Found", { status: 404 });
    if (endpoint === "models")
      return json(200, { models: MODELS, default: MODELS[0]?.id, current: model });
    if (endpoint === "model") {
      model = String(body["model"]);
      return json(200, { chatId, model });
    }
    if (endpoint === "cancel") {
      const cancelled = running !== undefined;
      running?.cancel();
      return json(200, { chatId, cancelled });
    }
    if (endpoint === "progress" && running !== undefined)
      return json(200, {
        chatId,
        state: "running",
        attempt: 1,
        maxAttempts: 4,
        errors: [],
        errorCount: 0,
        elapsedMs: Date.now() - running.startedAt,
      });
    return json(404, { error: "not_found", message: `нет запроса для ${endpoint}` });
  };
}
