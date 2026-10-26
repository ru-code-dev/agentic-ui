/**
 * The one typed channel between the playground app and its `/preview` documents (the device
 * iframe and any preview opened in a new tab). Same-origin, so a BroadcastChannel reaches all.
 */
export type ErrorSource = "runtime" | "render" | "console";

export type AppToPreview =
  /** Render these A2UI messages from a clean state (`revision` forces a re-render). */
  | { readonly type: "render"; readonly messages: readonly unknown[]; readonly revision: number }
  /** A simulated agent reply (mock rule): apply on top of the current state. */
  | { readonly type: "reply"; readonly messages: readonly unknown[] }
  /** Replace a surface's data model (Data model tab "Apply"). */
  | { readonly type: "applyDataModel"; readonly surfaceId: string; readonly value: unknown };

export type PreviewToApp =
  /** A preview document started and wants the current messages. */
  | { readonly type: "hello"; readonly previewId: string }
  /** The user fired an action. */
  | {
      readonly type: "action";
      readonly previewId: string;
      readonly name: string;
      readonly surfaceId: string;
      readonly context: unknown;
      readonly dataModel: unknown;
      readonly timestamp: string;
    }
  /** A surface's data model changed. */
  | {
      readonly type: "dataModel";
      readonly previewId: string;
      readonly surfaceId: string;
      readonly value: unknown;
    }
  /** Applying messages, rendering, or the preview console reported an error. */
  | {
      readonly type: "error";
      readonly previewId: string;
      readonly source: ErrorSource;
      readonly message: string;
    }
  /** A render or reply finished. */
  | { readonly type: "rendered"; readonly previewId: string; readonly revision: number };

export type PreviewChannelMessage = AppToPreview | PreviewToApp;

export const CHANNEL_NAME = "agentic-ui:preview";

export interface PreviewChannel {
  post(message: PreviewChannelMessage): void;
  subscribe(listener: (message: PreviewChannelMessage) => void): () => void;
  close(): void;
}

export function openPreviewChannel(name = CHANNEL_NAME): PreviewChannel {
  const channel = new BroadcastChannel(name);
  return {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no targetOrigin parameter
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const onMessage = (event: MessageEvent<PreviewChannelMessage>) => listener(event.data);
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
    close: () => channel.close(),
  };
}
