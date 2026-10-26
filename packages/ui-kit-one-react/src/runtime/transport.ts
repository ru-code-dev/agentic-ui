import type { A2uiClientAction, A2uiMessage } from "@a2ui/web_core/v0_9";

/** The seam between the renderer and an agent: messages in, actions out. */
export interface Transport {
  /** Subscribes to agent → UI messages. Returns an unsubscribe function. */
  onMessages(listener: (messages: readonly A2uiMessage[]) => void): () => void;
  /** Sends a UI → agent action, with the surface data model when the surface asked for it. */
  sendAction(action: A2uiClientAction, dataModel?: unknown): void;
}

export interface SentAction {
  readonly action: A2uiClientAction;
  readonly dataModel: unknown;
}

/** In-process transport: the host pushes messages and observes sent actions. */
export class LocalTransport implements Transport {
  private readonly messageListeners = new Set<(messages: readonly A2uiMessage[]) => void>();
  private readonly actionListeners = new Set<(sent: SentAction) => void>();

  onMessages(listener: (messages: readonly A2uiMessage[]) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  sendAction(action: A2uiClientAction, dataModel?: unknown): void {
    for (const listener of this.actionListeners) listener({ action, dataModel });
  }

  /** Delivers messages to the renderer, as an agent reply would. */
  push(messages: readonly A2uiMessage[]): void {
    for (const listener of this.messageListeners) listener(messages);
  }

  /** Observes actions the renderer sends. Returns an unsubscribe function. */
  onAction(listener: (sent: SentAction) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }
}
