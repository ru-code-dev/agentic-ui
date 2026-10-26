import type { A2uiMessage } from "@a2ui/web_core/v0_9";
import {
  createUiKitRuntime,
  LocalTransport,
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
 * models (on every change), errors and render completion through `events`.
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
      const dataModel = next.processor.getSurface(surfaceId)?.dataModel;
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
