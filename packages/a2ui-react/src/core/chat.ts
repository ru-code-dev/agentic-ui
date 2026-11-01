import { createAgentClient, type AgentClient } from "./client.ts";
import { chatModels, notice, pollProgress } from "./chat-extras.ts";
import { createChatStore, type TurnResult } from "./chat-state.ts";
import { createRepairs } from "./repair.ts";
import {
  actionSent,
  clientOptions,
  failedResult,
  invalidUi,
  promptSent,
  randomChatId,
  type FiredAction,
  type Refused,
  type Sent,
} from "./chat-results.ts";
import { agentUrl } from "./http.ts";
import { createSurfaceLog } from "./surfaces.ts";

/** The fallback surface's button (SV-C9): the chat re-sends its last prompt. */
export const RETRY_EVENT = "agent.retry";
/** After a confirmed /cancel the request must answer within this grace, else the chat stops waiting (A3-16). */
export const CANCEL_GRACE_MS = 10_000;

export interface A2UIChatOptions {
  /** The server base (`/api` or an absolute URL); ignored when `client` is given. */
  readonly endpoint?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly headers?: Readonly<Record<string, string>>;
  /** A ready client (a host's own transport, a scripted agent in tests and demos). */
  readonly client?: AgentClient;
  /** One server conversation per chatId (default: a new random id). */
  readonly chatId?: string;
  /** `/progress` poll interval (ms). */
  readonly pollMs?: number;
}

/**
 * SV-C26/SV-C27 headless chat over an AgentClient: one turn at a time; the text of every reply is kept, its
 * messages are merged-then-checked into the chat's surfaces (SV-C28) — created/updated in place by surfaceId.
 * A text-only reply and text + failed UI are explicit turn states. A reply the page rejects (or cannot render)
 * gets one repair turn with the exact errors (DEC-063, `repairOf` DEC-064). Cancel uses `/cancel` when the server
 * has it, else aborts the request on the client.
 */
export function createA2UIChat(options: A2UIChatOptions = {}) {
  const client =
    options.client ??
    createAgentClient({ endpoint: options.endpoint ?? "/api", ...clientOptions(options) });
  const store = createChatStore(options.chatId ?? randomChatId());
  const surfaces = createSurfaceLog();
  const models = chatModels(client, store);
  const pollMs = options.pollMs ?? 1000;
  // A4-23: a placeholder names the request as sent (base path included) when the chat made the client.
  const base = options.client === undefined ? (options.endpoint ?? "/api") : "";
  const requestName = (kind: "prompt" | "action") => `POST ${agentUrl(base, kind)}`;
  let sequence = 0;
  let lastPrompt: string | undefined;
  let lastFailed: Sent | undefined;
  let shown: (Refused & { repaired: boolean }) | undefined;
  let turn:
    | { id: number; abort: AbortController; grace?: ReturnType<typeof setTimeout> }
    | undefined;
  const busy = () => store.get().working !== undefined || store.get().models?.pending === true;

  const finish = (id: number, result: TurnResult) =>
    store.set({
      turns: store.get().turns.map((t) => (t.id === id ? Object.assign({}, t, { result }) : t)),
      working: store.get().working?.turnId === id ? undefined : store.get().working,
    });

  const repairs = createRepairs<Refused>(busy, (text, refused) => {
    const { origin, turnId, shown: wasShown } = refused;
    if (shown === refused) shown.repaired = true; // A5-03: the whole burst went into this one repair
    if (turnId !== undefined && wasShown) surfaces.undoReply();
    return run(promptSent(client, text, { turnId }), origin); // a new request: never joins the rejected one
  });

  async function run(sent: Sent, origin: Sent = sent): Promise<void> {
    if (busy()) return;
    const { chatId } = store.get();
    lastFailed = undefined;
    const id = ++sequence;
    const startedAt = Date.now();
    store.set({
      turns: [
        ...store.get().turns,
        { id, request: sent.request, model: store.get().models?.current },
      ],
      working: {
        turnId: id,
        startedAt,
        progress: undefined,
        cancelling: false,
        cancelUnconfirmed: false,
      },
    });
    turn = { id, abort: new AbortController() };
    const stop = pollProgress(client, store, id, pollMs);
    const name = requestName(sent.request.kind);
    try {
      const outcome = await sent.call(chatId, turn.abort.signal);
      if (store.get().chatId !== chatId) return;
      const base = {
        text: outcome.text,
        attempts: outcome.attempts,
        durationMs: outcome.durationMs,
        errors: outcome.errors,
        reason: outcome.reason ?? undefined,
      };
      const applied = outcome.messages.length === 0 ? undefined : surfaces.apply(outcome.messages);
      const turnId = outcome.turnId ?? undefined;
      if (applied !== undefined && !applied.valid) {
        lastFailed = origin; // A4-15: «Повторить» asks the agent again
        const problem = invalidUi(name, applied.errors, outcome.messages);
        finish(id, {
          ...base,
          state: "rejected",
          created: [],
          updated: [],
          messages: [],
          errors: applied.errors,
          problem,
        });
        if (sent.request.kind !== "prompt" || sent.request.repair !== true)
          repairs.later(applied.errors, { origin, turnId, shown: false });
        return;
      }
      const repaired = sent.request.kind === "prompt" && sent.request.repair === true;
      shown = { origin, turnId, shown: applied !== undefined, repaired };
      const created = applied?.created ?? [];
      const updated = applied?.updated ?? [];
      const state =
        outcome.status === "cancelled"
          ? "cancelled"
          : outcome.status === "fallback"
            ? "failed-ui"
            : applied
              ? "ui"
              : "text";
      finish(id, { ...base, state, created, updated, messages: applied ? outcome.messages : [] });
    } catch (failure) {
      lastFailed = sent;
      if (store.get().chatId === chatId) finish(id, failedResult(failure, startedAt));
    } finally {
      stop();
      clearTimeout(turn?.grace);
      if (turn?.id === id) turn = undefined;
    }
  }

  const giveUp = (reason: string) => turn?.abort.abort(reason);
  const prompt = (text: string): Sent => promptSent(client, text);

  return {
    store,
    surfaces,
    getState: store.get,
    subscribe: store.subscribe,
    /** True while a turn runs or a model change is in flight: send and action are ignored then. */
    busy,
    /** A user message (ignored while a turn runs or the text is blank). */
    send(text: string): Promise<void> {
      const trimmed = text.trim();
      if (trimmed === "" || busy()) return Promise.resolve();
      lastPrompt = trimmed;
      return run(prompt(trimmed));
    },
    /** A surface action, sent with the surface's data model (ignored while a turn runs). */
    action(fired: FiredAction): Promise<void> {
      if (busy()) return Promise.resolve();
      if (fired.name === RETRY_EVENT)
        return lastPrompt === undefined ? Promise.resolve() : run(prompt(lastPrompt));
      surfaces.adoptData(fired.surfaceId, fired.dataModel);
      return run(actionSent(client, fired));
    },
    /** The failed request again as it was sent; otherwise the last prompt again. */
    retry(): Promise<void> {
      const again = lastFailed ?? (lastPrompt === undefined ? undefined : prompt(lastPrompt));
      return again === undefined ? Promise.resolve() : run(again);
    },
    /**
     * Stops the running turn: `/cancel` when the server has it (its request then answers `cancelled`; no answer
     * within CANCEL_GRACE_MS, or a second Cancel, stops waiting); a `/cancel` that fails or is not applied marks
     * the turn `cancelUnconfirmed` and the next Cancel stops waiting (A3-16); no `/cancel` aborts at once.
     */
    async cancel(): Promise<void> {
      const working = store.get().working;
      if (working === undefined || turn === undefined) return;
      if (working.cancelling || working.cancelUnconfirmed)
        return void giveUp("Отменено на странице: сервер не подтвердил отмену");
      store.set({ working: { ...working, cancelling: true } });
      const confirmed = await client.cancel(store.get().chatId).catch((failure: unknown) => {
        notice(store, failure); // A4-21: a malformed or wrong-contract answer is a chat notice
        return false;
      });
      const now = store.get().working;
      if (now?.turnId !== working.turnId || turn === undefined) return;
      if (confirmed === true)
        turn.grace = setTimeout(() => giveUp("сервер не ответил после отмены"), CANCEL_GRACE_MS);
      else if (confirmed === undefined) giveUp("у сервера нет /cancel: запрос прерван на странице");
      else store.set({ working: { ...now, cancelling: false, cancelUnconfirmed: true } });
    },
    /** DEC-063: an expression or render error of the reply on screen asks the agent once to fix it. */
    reportRenderError(message: string): void {
      // A5-03: every error of the burst is collected; `repaired` is set when the repair is sent
      if (shown === undefined || shown.repaired || !shown.shown) return;
      repairs.later([message], shown);
    },
    loadModels: models.load,
    setModel: models.choose,
    /**
     * A fresh conversation (new chatId = new agent session), surfaces cleared; a chosen model is applied to
     * the new chat too (it would start on the CLI default otherwise).
     */
    async reset(chatId: string = randomChatId()): Promise<void> {
      if (busy()) return;
      repairs.reset();
      lastPrompt = lastFailed = shown = undefined;
      surfaces.clear();
      store.set({ chatId, turns: [], working: undefined, notices: [] });
      const model = store.get().models?.current;
      if (model !== undefined && model !== "") await models.choose(model);
    },
    dispose(): void {
      repairs.reset();
      giveUp("chat disposed");
    },
  };
}

export type A2UIChat = ReturnType<typeof createA2UIChat>;
