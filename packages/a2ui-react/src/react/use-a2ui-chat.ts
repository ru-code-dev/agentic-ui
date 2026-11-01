import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { Catalog } from "@a2ui/web_core/v0_9";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createA2UIChat, type A2UIChat, type A2UIChatOptions } from "../core/chat.ts";
import type { ChatState } from "../core/chat-state.ts";
import type { Surface, SurfaceAction } from "./renderer.ts";
import { useRenderer } from "./use-renderer.ts";

export interface UseA2UIChatOptions extends A2UIChatOptions {
  /** A host's own kit catalog (REMAP kit swap); default: ui-kit-one. */
  readonly catalog?: Catalog<ReactComponentImplementation>;
  /**
   * A headless chat the host made (`createA2UIChat`) and owns: it outlives the component (kept across route
   * changes, never disposed by the hook); the connection options above are then ignored.
   */
  readonly chat?: A2UIChat;
  /** Every surface action (observer); `sent` is false when the chat was busy and dropped it (one turn at a time). */
  readonly onAction?: (action: SurfaceAction, sent: boolean) => void;
  /** Every expression, processing and component render error of the chat's surfaces (observer). */
  readonly onError?: (message: string) => void;
}

export interface UseA2UIChat extends ChatState {
  /** The chat's live surfaces in creation order, updated in place by surfaceId. */
  readonly surfaces: readonly Surface[];
  readonly send: (text: string) => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly setModel: (model: string) => Promise<void>;
  /** The headless chat (actions, render-error reports, reset, data-model edits through `chat.surfaces`). */
  readonly chat: A2UIChat;
}

/**
 * SV-C26 layer 2: a chat with the agent server. Options are read once (a new `chatId` → `chat.reset`;
 * `onAction` / `onError` may change on every render). Surface actions go to the server, render errors ask the
 * agent for one repair (DEC-063); the model list is probed on mount (no `/models` = `models` undefined).
 */
export function useA2UIChat(options: UseA2UIChatOptions = {}): UseA2UIChat {
  const [chat] = useState(() => options.chat ?? createA2UIChat(options));
  const owned = options.chat === undefined;
  const state = useSyncExternalStore(chat.subscribe, chat.getState, chat.getState);
  const surfaces = useRenderer(
    chat.surfaces,
    {
      onAction: (action) => {
        options.onAction?.(action, !chat.busy());
        const { name, surfaceId, context, dataModel } = action;
        void chat.action({ name, surfaceId, context, dataModel });
      },
      onError: (message) => {
        options.onError?.(message);
        chat.reportRenderError(message);
      },
    },
    options.catalog,
  );
  useEffect(() => {
    void chat.loadModels();
    return () => {
      if (owned) chat.dispose();
    };
  }, [chat, owned]);
  return {
    ...state,
    surfaces,
    send: chat.send,
    cancel: chat.cancel,
    retry: chat.retry,
    setModel: chat.setModel,
    chat,
  };
}
