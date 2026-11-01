/**
 * The one typed channel between the playground app and its `/preview` documents (the device
 * iframe and any preview opened in a new tab). Same-origin, so a BroadcastChannel reaches all;
 * documents of another build (PG-28) are ignored.
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

/** PG-28: this build's id; every message goes out wrapped as `{ build, message }`. */
export const BUILD_ID = import.meta.env.BUILD_ID;

interface Envelope {
  readonly build: string;
  readonly message: PreviewChannelMessage;
}

/** The build of a received payload: an envelope's id, or "unknown" (a build without PG-28). */
const buildOf = (data: unknown): string =>
  typeof data === "object" && data !== null && typeof (data as Envelope).build === "string"
    ? (data as Envelope).build
    : "unknown";

export interface PreviewChannel {
  post(message: PreviewChannelMessage): void;
  /**
   * Messages of this build go to `listener`; a message of any other build (an old preview tab
   * after a rebuild) is dropped and reported to `onOtherBuild` with that build's id.
   */
  subscribe(
    listener: (message: PreviewChannelMessage) => void,
    onOtherBuild?: (build: string) => void,
  ): () => void;
  close(): void;
}

export function openPreviewChannel(name = CHANNEL_NAME, build = BUILD_ID): PreviewChannel {
  const channel = new BroadcastChannel(name);
  return {
    post: (message) =>
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no targetOrigin parameter
      channel.postMessage({ build, message } satisfies Envelope),
    subscribe(listener, onOtherBuild) {
      const onMessage = (event: MessageEvent<unknown>) => {
        const from = buildOf(event.data);
        if (from === build) listener((event.data as Envelope).message);
        else onOtherBuild?.(from);
      };
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
    close: () => channel.close(),
  };
}
