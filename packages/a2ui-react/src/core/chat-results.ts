import type { AgentClient, Outcome } from "./client.ts";
import type { ResponseProblem } from "./responses.ts";
import { AgentRequestError, excerptOf } from "./responses.ts";
import type { ChatRequest, TurnResult } from "./chat-state.ts";

const randomHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
/** A new random chat id (`crypto.getRandomValues`: also outside a secure context, A4-13). */
export const randomChatId = () => `chat-${randomHex()}`;

type Call = (chatId: string, signal: AbortSignal) => Promise<Outcome>;
/**
 * One logical request. Its `requestId` is fixed when it is made (A4-08 / A5-09): a retry runs the same Sent, so a
 * server still running it joins the retry instead of running the agent twice; a repair is a new Sent (new id).
 */
export interface Sent {
  readonly request: ChatRequest;
  readonly call: Call;
}
/** A reply the page refused or could not render (DEC-063): its request and its server `turnId` (DEC-064). */
export interface Refused {
  readonly origin: Sent;
  readonly turnId?: string | undefined;
  readonly shown: boolean;
}

const newRequestId = () => `req-${randomHex()}`;

/** A user prompt, or (`repair` given) the DEC-063 repair turn of the reply with `repair.turnId` (DEC-064). */
export function promptSent(
  client: AgentClient,
  text: string,
  repair?: { readonly turnId: string | undefined },
): Sent {
  const requestId = newRequestId();
  const request: ChatRequest =
    repair === undefined ? { kind: "prompt", text } : { kind: "prompt", text, repair: true };
  return {
    request,
    call: (chatId, signal) => client.prompt(chatId, text, signal, repair?.turnId, requestId),
  };
}

/** A surface action, sent with the surface's data model. */
export function actionSent(
  client: AgentClient,
  { name, surfaceId, context, dataModel }: FiredAction,
): Sent {
  const requestId = newRequestId();
  const event = context === undefined ? { name } : { name, context };
  return {
    request: { kind: "action", name, surfaceId, context },
    call: (chatId, signal) =>
      client.action(chatId, { surfaceId, event, dataModel, requestId }, signal),
  };
}

export interface FiredAction {
  readonly name: string;
  readonly surfaceId: string;
  readonly context?: unknown;
  readonly dataModel?: unknown;
}

/** The client options a chat passes on (only those set: exactOptionalPropertyTypes). */
export function clientOptions({
  fetch,
  headers,
}: {
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}) {
  return {
    ...(fetch === undefined ? {} : { fetch }),
    ...(headers === undefined ? {} : { headers }),
  };
}

const problemOf = (failure: unknown) =>
  failure instanceof AgentRequestError ? failure.problem : undefined;

/** The result of a turn whose request failed (a client-side abort is `cancelled`, reason `local`). */
export function failedResult(failure: unknown, startedAt: number): TurnResult {
  const problem = problemOf(failure);
  const local = problem?.kind === "timeout";
  return {
    state: local ? "cancelled" : "error",
    text: local ? "Страница перестала ждать ответа сервера." : "",
    created: [],
    updated: [],
    messages: [],
    attempts: 0,
    durationMs: Date.now() - startedAt,
    errors: [failure instanceof Error ? failure.message : String(failure)],
    reason: local
      ? "local"
      : problem?.kind === "http"
        ? `http_${problem.httpStatus}`
        : (problem?.kind ?? "network"),
    problem,
  };
}

/** DEC-054: the placeholder problem of a reply whose UI the page refused (merged state invalid). */
export const invalidUi = (
  request: string,
  errors: readonly string[],
  messages: readonly unknown[],
): ResponseProblem => ({
  kind: "invalid-ui",
  request,
  httpStatus: 200,
  title: "Интерфейс от сервера не прошёл проверку страницы и не показан",
  details: errors,
  excerpt: excerptOf(JSON.stringify(messages)),
});
