import type { ModelInfo, Progress } from "./client.ts";
import type { ResponseProblem } from "./responses.ts";

export type ChatRequest =
  | { readonly kind: "prompt"; readonly text: string; readonly repair?: true }
  | {
      readonly kind: "action";
      readonly name: string;
      readonly surfaceId: string;
      readonly context: unknown;
    };

/**
 * How a turn ended (SV-C27: the text is always shown, surfaces are optional per turn):
 * `text` a text-only reply (`ok`, no messages); `ui` text + surfaces created/updated; `failed-ui` the server
 * gave up on the UI (`fallback`: its text, plus the fallback surface when it sent one); `rejected` the page's
 * own check refused the UI (DEC-054, nothing rendered); `error` the request failed; `cancelled`.
 */
export type TurnState = "text" | "ui" | "failed-ui" | "rejected" | "error" | "cancelled";

export interface TurnResult {
  readonly state: TurnState;
  readonly text: string;
  /** Surface ids this turn created / changed in place (SV-C26). */
  readonly created: readonly string[];
  readonly updated: readonly string[];
  /** The A2UI messages this turn applied to the surfaces (empty: text only, rejected, failed request). */
  readonly messages: readonly unknown[];
  readonly attempts: number;
  readonly durationMs: number;
  /** The server's last validation errors (fallback) or the page's errors (rejected). */
  readonly errors: readonly string[];
  readonly reason?: string | undefined;
  /** DEC-054: what exactly went wrong (request, HTTP status, details, raw excerpt). */
  readonly problem?: ResponseProblem | undefined;
}

export interface ChatTurn {
  readonly id: number;
  readonly request: ChatRequest;
  /** The chat's model when the turn was sent (undefined: no model list / CLI default). */
  readonly model: string | undefined;
  /** undefined while the turn runs. */
  readonly result?: TurnResult | undefined;
}

/** The running turn (SV-C20 working state; `progress` only when the server has `/progress`). */
export interface Working {
  readonly turnId: number;
  readonly startedAt: number;
  readonly progress: Progress | undefined;
  readonly cancelling: boolean;
  /** The last Cancel did not reach the server or was not applied: the next Cancel stops waiting (A3-16). */
  readonly cancelUnconfirmed: boolean;
}

export interface ModelChoice {
  readonly list: readonly ModelInfo[];
  readonly current: string;
  /** The last model change the server refused. */
  readonly error?: string | undefined;
  /** A POST /model is in flight: nothing is sent until it is answered (A3-17). */
  readonly pending: boolean;
}

export interface ChatState {
  readonly chatId: string;
  /** `error`: the latest turn failed or its UI was rejected (`error` holds the details). */
  readonly status: "idle" | "working" | "error";
  readonly working: Working | undefined;
  readonly error: ResponseProblem | undefined;
  readonly turns: readonly ChatTurn[];
  /** undefined: the server offers no model list (no `/models`, or an empty one). */
  readonly models: ModelChoice | undefined;
  /** DEC-054: answers outside a turn the client could not use (progress, models, model, cancel). */
  readonly notices: readonly ResponseProblem[];
}

const statusOf = (state: Omit<ChatState, "status" | "error">) => {
  const last = state.turns.at(-1)?.result;
  const failed = last?.state === "error" || last?.state === "rejected";
  return {
    status: state.working ? "working" : failed ? "error" : "idle",
    error: state.working || !failed ? undefined : last?.problem,
  } as const;
};

/** A minimal external store (useSyncExternalStore-compatible); `status`/`error` are derived on every change. */
export function createChatStore(chatId: string) {
  let state: ChatState = {
    chatId,
    status: "idle",
    working: undefined,
    error: undefined,
    turns: [],
    models: undefined,
    notices: [],
  };
  const listeners = new Set<() => void>();
  return {
    get: (): ChatState => state,
    set(change: Partial<Omit<ChatState, "status" | "error">>): void {
      const next = { ...state, ...change };
      state = { ...next, ...statusOf(next) };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ChatStore = ReturnType<typeof createChatStore>;
