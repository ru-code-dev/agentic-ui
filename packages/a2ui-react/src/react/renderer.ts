import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { A2uiMessage, Catalog, SurfaceModel } from "@a2ui/web_core/v0_9";
import {
  LocalTransport,
  createUiKitRuntime,
  onComponentError,
  type UiKitRuntime,
} from "@agentic-ui/ui-kit-one-react";
import type { SurfaceChange, SurfaceLog } from "../core/surfaces.ts";

export type Surface = SurfaceModel<ReactComponentImplementation>;

/** A surface action as the renderer fires it, with the surface's data model when it sends one. */
export interface SurfaceAction {
  readonly name: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly context: unknown;
  readonly timestamp: string;
  readonly dataModel: unknown;
}

export interface RendererEvents {
  readonly onAction: (action: SurfaceAction) => void;
  /** Message processing, expression and component render errors (DEC-063: the chat may ask for a repair). */
  readonly onError: (message: string) => void;
}

const plain = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/**
 * The renderer of one surface log: a ui-kit-one runtime (web_core processor + kit catalog, or a host's own
 * catalog, REMAP kit swap) that applies every accepted reply on top and is rebuilt from the accepted messages
 * when the log resets (DEC-064 undo, a new chat). `surfaces()` = the live surfaces in creation order.
 */
export function createSurfaceRenderer(
  log: SurfaceLog,
  events: () => RendererEvents,
  catalog?: Catalog<ReactComponentImplementation>,
) {
  const listeners = new Set<() => void>();
  let surfaces: readonly Surface[] = [];
  let runtime: UiKitRuntime | undefined;
  let transport: LocalTransport | undefined;
  let stops: (() => void)[] = [];

  const changed = () => {
    surfaces = runtime === undefined ? [] : [...runtime.processor.getSurfaces().values()];
    for (const listener of listeners) listener();
  };
  const teardown = () => {
    for (const stop of stops) stop();
    stops = [];
    runtime?.dispose();
    runtime = undefined;
  };
  const build = (messages: readonly unknown[]) => {
    teardown();
    transport = new LocalTransport();
    runtime = createUiKitRuntime({ transport, ...(catalog === undefined ? {} : { catalog }) });
    const { processor } = runtime;
    const created = processor.onSurfaceCreated((surface) => {
      // A4-14: expression and function errors are reported per surface, not by message processing.
      const failed = surface.onError.subscribe((error) =>
        events().onError(`${surface.id}: ${error.message}`),
      );
      stops.push(() => failed.unsubscribe());
      changed();
    });
    const deleted = processor.onSurfaceDeleted(changed);
    stops.push(
      () => created.unsubscribe(),
      () => deleted.unsubscribe(),
      runtime.onError((error) => events().onError(error.message)),
      // PKG-A-O2: only the components of this renderer's own surfaces (another chat on the page has its own)
      onComponentError(({ component, id, message, surface }) => {
        if ([...processor.getSurfaces().values()].includes(surface as Surface))
          events().onError(`${component}${id ? ` «${id}»` : ""}: ${message}`);
      }),
      transport.onAction(({ action, dataModel }) =>
        events().onAction({
          ...action,
          context: plain(action.context),
          dataModel: plain(dataModel),
        }),
      ),
    );
    transport.push(messages as readonly A2uiMessage[]);
    changed();
  };
  const follow = (change: SurfaceChange) => {
    if (change.kind === "reset") build(change.messages);
    else transport?.push(change.messages as readonly A2uiMessage[]);
  };

  build(log.messages());
  const unfollow = log.subscribe(follow);
  return {
    surfaces: (): readonly Surface[] => surfaces,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose(): void {
      unfollow();
      teardown();
    },
  };
}

export type SurfaceRenderer = ReturnType<typeof createSurfaceRenderer>;
