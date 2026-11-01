import { send, type Transport } from "./http.ts";
import { AgentRequestError } from "./responses.ts";

/** One `/prompt` or `/action` answer (SERVER-CONTRACT.md). */
export interface Outcome {
  readonly chatId: string;
  readonly status: "ok" | "fallback" | "cancelled";
  /** May be empty: an `ok` with `messages: []` is a text-only reply (SV-C27). */
  readonly messages: readonly unknown[];
  readonly text: string;
  readonly fallback: boolean;
  readonly errors: readonly string[];
  readonly attempts: number;
  readonly reason?: string | null;
  readonly durationMs: number;
  /** DEC-064 (optional): an `ok` reply's id in the server's chat state; a repair names it in `repairOf`. */
  readonly turnId?: string | null;
}

/** `GET {base}/progress` (optional endpoint). */
export interface Progress {
  readonly chatId: string;
  readonly state: "running" | "repairing" | "done" | "fallback" | "cancelled";
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly errors: readonly string[];
  readonly errorCount: number;
  readonly elapsedMs: number;
}

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
}

/** `GET {base}/models` (optional endpoint). */
export interface Models {
  readonly models: readonly ModelInfo[];
  readonly default?: string | null;
  readonly current?: string | null;
}

export interface ActionRequest {
  readonly surfaceId: string;
  readonly event: { readonly name: string; readonly context?: unknown };
  readonly dataModel?: unknown;
  /** A4-08 / A5-09: one id per logical request; a retry resends it, so the server joins a still-running run. */
  readonly requestId?: string;
}

/** The optional endpoints (SV-C26): probed on first use; a missing one never fails a chat. */
export type OptionalEndpoint = "cancel" | "progress" | "models" | "model";

/** The server calls of a chat (SERVER-CONTRACT.md); an interface so hosts and tests can replace it. */
export interface AgentClient {
  /**
   * `repairOf` (DEC-064): the `turnId` of the reply the page rejected, rolled back by the server first;
   * `requestId` (A4-08 / A5-09): one id per logical request, resent by a retry so the server joins it.
   */
  prompt(
    chatId: string,
    text: string,
    signal?: AbortSignal,
    repairOf?: string,
    requestId?: string,
  ): Promise<Outcome>;
  action(chatId: string, action: ActionRequest, signal?: AbortSignal): Promise<Outcome>;
  /** undefined: the server has no `/cancel` (the caller aborts its own request); gives up after CANCEL_TIMEOUT_MS. */
  cancel(chatId: string): Promise<boolean | undefined>;
  /**
   * undefined when the server has no such endpoint or no request of the chat yet (404, 405, 501);
   * throws on any other failure (5xx, network, a body that is not a progress state).
   */
  progress(chatId: string, signal?: AbortSignal): Promise<Progress | undefined>;
  /** undefined when the server has no model list (404, 405, 501); throws on any other failure. */
  models(chatId: string): Promise<Models | undefined>;
  setModel(chatId: string, model: string): Promise<string>;
}

export interface AgentClientOptions {
  /** The server base: a path (`/api`, same origin) or an absolute URL; `{endpoint}/prompt` etc. */
  readonly endpoint: string;
  /** Default: `globalThis.fetch` at call time (Node 18+, browsers). */
  readonly fetch?: typeof globalThis.fetch;
  /** Sent with every request (e.g. a host's CSRF header; cookies go with the host's fetch). */
  readonly headers?: Readonly<Record<string, string>>;
}

/** How long Cancel waits for POST /cancel before the client gives up on it (A3-16). */
export const CANCEL_TIMEOUT_MS = 5000;
/** GET /models and POST /model give up after this (the failure branch then clears the lock, A4-16). */
export const MODEL_TIMEOUT_MS = 15_000;

/** Statuses of a server without an optional endpoint (or, for progress, without a request of the chat yet). */
const NO_ENDPOINT = new Set([404, 405, 501]);

const noEndpoint = (failure: unknown): failure is AgentRequestError =>
  failure instanceof AgentRequestError &&
  failure.problem.kind === "http" &&
  NO_ENDPOINT.has(failure.status);

/**
 * SV-C26 headless client: only `/prompt` and `/action` are required. An optional endpoint that answers
 * 404/405/501 is not called again (a 404 that is the server's own JSON, e.g. `/progress` before the chat's
 * first request, keeps it). Every answer is shape- and version-checked (DEC-054, DEC-056).
 */
export function createAgentClient({ endpoint, fetch, headers }: AgentClientOptions): AgentClient {
  const transport: Transport = { endpoint, fetch, headers };
  const missing = new Set<OptionalEndpoint>();
  async function optional<T>(name: OptionalEndpoint, call: () => Promise<T>) {
    if (missing.has(name)) return undefined;
    try {
      return await call();
    } catch (failure) {
      if (!noEndpoint(failure)) throw failure;
      if (!failure.served || failure.status !== 404) missing.add(name);
      return undefined;
    }
  }
  return {
    prompt: (chatId, text, signal, repairOf, requestId) =>
      send<Outcome>(transport, "prompt", {
        body: {
          chatId,
          text,
          ...(repairOf === undefined ? {} : { repairOf }),
          ...(requestId === undefined ? {} : { requestId }),
        },
        signal,
      }),
    action: (chatId, action, signal) =>
      send<Outcome>(transport, "action", { body: { chatId, ...action }, signal }),
    cancel: async (chatId) => {
      const answer = await optional("cancel", () =>
        send<{ cancelled: boolean }>(transport, "cancel", {
          body: { chatId },
          signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
        }),
      );
      return answer?.cancelled;
    },
    progress: (chatId, signal) =>
      optional("progress", () =>
        send<Progress>(transport, "progress", { query: { chatId }, signal }),
      ),
    models: (chatId) =>
      optional("models", () =>
        send<Models>(transport, "models", {
          query: { chatId },
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        }),
      ),
    // A4-16: a POST /model that never answers must not lock Send and the dropdown forever.
    setModel: async (chatId, model) =>
      (
        await send<{ model: string }>(transport, "model", {
          body: { chatId, model },
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        })
      ).model,
  };
}
