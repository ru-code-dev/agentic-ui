import type { SurfaceAction } from "@agentic-ui/a2ui-react";
import { createA2UIChat, type A2UIChat, type ChatTurn } from "@agentic-ui/a2ui-react/core";
import { create } from "zustand";
import type { LoggedEvent } from "../state/session-store.ts";
import { AGENT_API_BASE } from "./endpoint.ts";

/** Events-tab name of a preview action fired while a turn runs (one turn at a time, nothing is sent). */
export const notSent = (name: string) => `${name} (не отправлено: агент занят)`;

/** A finished turn that changed surfaces is a reply event (`prompt → ok`, `form.submit → fallback`). */
function replyEvent(turn: ChatTurn): Omit<LoggedEvent, "id"> | undefined {
  const { request, result } = turn;
  const surfaceId = result?.created[0] ?? result?.updated[0];
  if (result === undefined || surfaceId === undefined) return undefined;
  const asked = request.kind === "prompt" ? "prompt" : request.name;
  return {
    time: new Date().toISOString(),
    kind: "reply",
    surfaceId,
    name: `${asked} → ${result.state === "failed-ui" ? "fallback" : "ok"}`,
    context: undefined,
    dataModel: undefined,
  };
}

/**
 * The Agent page's Events tab and error banner over a headless chat: surface actions (sent or dropped while
 * the chat is busy), reply events for every finished turn that changed surfaces, and the surfaces' render
 * errors (cleared when the surfaces are rebuilt). A new chat empties both.
 */
export function createAgentLog(chat: A2UIChat) {
  const useLog = create<{
    readonly events: readonly LoggedEvent[];
    readonly runtimeErrors: readonly string[];
  }>()(() => ({ events: [], runtimeErrors: [] }));
  let sequence = 0;
  let chatId = chat.getState().chatId;
  const logged = new Set<number>();
  const add = (event: Omit<LoggedEvent, "id">) =>
    useLog.setState((state) => ({ events: [...state.events, { ...event, id: ++sequence }] }));
  chat.subscribe(() => {
    const { chatId: current, turns } = chat.getState();
    if (current !== chatId) {
      chatId = current;
      logged.clear();
      useLog.setState({ events: [], runtimeErrors: [] });
    }
    for (const turn of turns) {
      if (turn.result === undefined || logged.has(turn.id)) continue;
      logged.add(turn.id);
      const reply = replyEvent(turn);
      if (reply !== undefined) add(reply);
    }
  });
  chat.surfaces.subscribe((change) => {
    if (change.kind === "reset") useLog.setState({ runtimeErrors: [] });
  });
  return {
    useLog,
    /** `useA2UIChat({ onAction })`: every surface action, marked when the busy chat did not send it. */
    action(action: SurfaceAction, sent: boolean): void {
      const { timestamp, surfaceId, name, context, dataModel } = action;
      add({
        time: timestamp,
        kind: "action",
        surfaceId,
        name: sent ? name : notSent(name),
        context,
        dataModel,
      });
    },
    /** `useA2UIChat({ onError })` and the preview's boundaries: one banner line per distinct message. */
    error(message: string): void {
      useLog.setState((state) =>
        state.runtimeErrors.includes(message)
          ? state
          : { runtimeErrors: [...state.runtimeErrors, message] },
      );
    },
    clear(): void {
      useLog.setState({ events: [] });
    },
  };
}

/**
 * The Agent page's chat: the package's headless chat at the page's endpoint (SV-C26 dogfooding). Module scope,
 * so a chat (and a POST /model in flight, A4-19) survives leaving the page; a reload starts a new chat.
 */
export const agentChat = createA2UIChat({ endpoint: AGENT_API_BASE });
export const agentLog = createAgentLog(agentChat);
