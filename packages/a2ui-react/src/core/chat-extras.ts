import type { AgentClient, Models, Progress } from "./client.ts";
import type { ChatStore } from "./chat-state.ts";
import { AgentRequestError } from "./responses.ts";

/** Consecutive "no progress" answers after which the chat stops polling for the turn and just waits. */
const ABSENT_POLLS = 3;
/**
 * A3-19: /progress names no request, so a progress older than the turn (its elapsedMs exceeds the turn's own
 * age by more than this slack) belongs to an earlier request and is ignored.
 */
export const PROGRESS_SLACK_MS = 2000;

/** True when `progress` can belong to the turn started at `startedAt` (A3-19). */
export const belongsToTurn = (progress: Progress, startedAt: number, now = Date.now()) =>
  progress.elapsedMs <= now - startedAt + PROGRESS_SLACK_MS;

/** A malformed answer or another contract version is a chat notice (DEC-054); HTTP errors are not. */
export function notice(store: ChatStore, failure: unknown): void {
  if (!(failure instanceof AgentRequestError)) return;
  const { problem } = failure;
  if (problem.kind !== "shape" && problem.kind !== "contract") return;
  const { notices } = store.get();
  if (!notices.some((n) => n.request === problem.request && n.title === problem.title))
    store.set({ notices: [...notices, problem] });
}

/**
 * Polls the optional `/progress` for the running turn `turnId` every `pollMs` (SV-C20): 3 answers in a row
 * without progress stop the polling (plain working state); a failed poll is only a missed update. Returns stop.
 */
export function pollProgress(
  client: AgentClient,
  store: ChatStore,
  turnId: number,
  pollMs: number,
): () => void {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let absent = 0;
  const current = () => !abort.signal.aborted && store.get().working?.turnId === turnId;
  const tick = async () => {
    const progress = await client
      .progress(store.get().chatId, abort.signal)
      .catch((failure: unknown) => {
        if (current()) notice(store, failure);
        return null;
      });
    const working = store.get().working;
    if (!current() || working === undefined) return;
    if (progress === undefined) {
      absent += 1;
      if (absent >= ABSENT_POLLS) return;
    } else if (progress !== null) {
      absent = 0;
      const live = progress.state === "running" || progress.state === "repairing";
      if (live && belongsToTurn(progress, working.startedAt))
        store.set({ working: { ...working, progress } });
    }
    timer = setTimeout(() => void tick(), pollMs);
  };
  timer = setTimeout(() => void tick(), pollMs);
  return () => {
    abort.abort("turn finished");
    clearTimeout(timer);
  };
}

const currentOf = (models: Models | undefined, otherwise: string) =>
  models?.current ?? models?.default ?? models?.models[0]?.id ?? otherwise;

const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

/** SV-C25 model list and choice; no `/models` (or an empty list) = no choice, never an error. */
export function chatModels(client: AgentClient, store: ChatStore) {
  return {
    async load(): Promise<void> {
      if (store.get().models?.pending === true) return;
      try {
        const models = await client.models(store.get().chatId);
        if (store.get().models?.pending === true) return;
        const list = models?.models ?? [];
        store.set({
          models:
            list.length === 0
              ? undefined
              : { list, current: currentOf(models, ""), pending: false },
        });
      } catch (failure) {
        store.set({ models: undefined });
        notice(store, failure);
      }
    },
    /** The chat's model, applied by the server on the next turn; nothing is sent while it is set (A3-17). */
    async choose(model: string): Promise<void> {
      const choice = store.get().models;
      if (choice === undefined || choice.pending) return;
      const { chatId } = store.get();
      store.set({ models: { ...choice, pending: true, error: undefined } });
      try {
        const applied = await client.setModel(chatId, model);
        if (store.get().chatId !== chatId) return;
        store.set({ models: { ...choice, current: applied === "" ? model : applied } });
      } catch (failure) {
        notice(store, failure);
        const server = await client.models(chatId).catch(() => undefined);
        if (store.get().chatId !== chatId) return;
        store.set({
          models: {
            list: server?.models.length ? server.models : choice.list,
            current: currentOf(server, choice.current),
            error: `Модель не изменена: ${message(failure)}`,
            pending: false,
          },
        });
      }
    },
  };
}
