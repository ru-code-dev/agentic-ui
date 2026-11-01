import type { A2uiMessage } from "@a2ui/web_core/v0_9";
import {
  createUiKitRuntime,
  LocalTransport,
  onComponentError,
  type UiKitRuntime,
} from "@agentic-ui/ui-kit-one-react";
import { useEffect, useRef, useState } from "react";
import type { ErrorSource } from "./channel.ts";

export interface PreviewRuntimeEvents {
  readonly onAction: (
    action: { name: string; surfaceId: string; context: unknown; timestamp: string },
    dataModel: unknown,
  ) => void;
  readonly onDataModel: (surfaceId: string, value: unknown) => void;
  readonly onError: (source: ErrorSource, message: string) => void;
  readonly onRendered: (revision: number) => void;
}

export interface PreviewRuntime {
  readonly runtime: UiKitRuntime | undefined;
  /** Applies messages on top of the current state (mock replies, data-model edits). */
  readonly apply: (messages: readonly unknown[]) => void;
}

const plain = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/**
 * Renders `messages` from a clean runtime for every new `revision`, and reports actions, data
 * models (on every change), errors (message processing and each surface's expression errors) and
 * render completion through `events`.
 */
export function usePreviewRuntime(
  messages: readonly unknown[] | undefined,
  revision: number,
  events: PreviewRuntimeEvents,
): PreviewRuntime {
  const [runtime, setRuntime] = useState<UiKitRuntime>();
  const transportRef = useRef<LocalTransport | undefined>(undefined);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (messages === undefined) return;
    const transport = new LocalTransport();
    const next = createUiKitRuntime({ transport });
    const stops: Array<() => void> = [];
    const watch = (surfaceId: string) => {
      const surface = next.processor.getSurface(surfaceId);
      // A4-14: expression and catalog errors (a function call failing at evaluation) are reported per
      // surface, not by the runtime's message processing; they go to the same banner.
      const failed = surface?.onError.subscribe((error) =>
        eventsRef.current.onError("runtime", `${surfaceId}: ${error.message}`),
      );
      if (failed !== undefined) stops.push(() => failed.unsubscribe());
      const dataModel = surface?.dataModel;
      if (dataModel === undefined) return;
      const subscription = dataModel.subscribe("/", (value) =>
        eventsRef.current.onDataModel(surfaceId, plain(value)),
      );
      stops.push(() => subscription.unsubscribe());
      eventsRef.current.onDataModel(surfaceId, plain(dataModel.get("/")));
    };
    const created = next.processor.onSurfaceCreated((surface) => watch(surface.id));
    stops.push(
      () => created.unsubscribe(),
      next.onError((error) => eventsRef.current.onError("runtime", error.message)),
      // A4-26: a component that failed to render shows its own placeholder; the page names it too.
      onComponentError(({ component, id, message }) =>
        eventsRef.current.onError("render", `${component}${id ? ` «${id}»` : ""}: ${message}`),
      ),
    );
    stops.push(
      transport.onAction(({ action, dataModel }) =>
        eventsRef.current.onAction(action, plain(dataModel)),
      ),
    );
    transport.push(messages as readonly A2uiMessage[]);
    transportRef.current = transport;
    setRuntime(next);
    eventsRef.current.onRendered(revision);
    return () => {
      for (const stop of stops) stop();
      next.dispose();
      transportRef.current = undefined;
    };
  }, [messages, revision]);

  return { runtime, apply: (more) => transportRef.current?.push(more as readonly A2uiMessage[]) };
}
