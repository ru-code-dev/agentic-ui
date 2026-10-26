import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import {
  MessageProcessor,
  type A2uiClientAction,
  type Catalog,
  type ValidationConfig,
} from "@a2ui/web_core/v0_9";
import { uiKitOneCatalog } from "../catalog.ts";
import { toCopyOnWrite } from "./copy-on-write.ts";
import type { Transport } from "./transport.ts";

export interface UiKitRuntime {
  readonly processor: MessageProcessor<ReactComponentImplementation>;
  /** Observes errors raised while applying incoming messages. Returns an unsubscribe function. */
  onError(listener: (error: Error) => void): () => void;
  dispose(): void;
}

export interface UiKitRuntimeOptions {
  readonly transport: Transport;
  readonly catalog?: Catalog<ReactComponentImplementation>;
  /** Structural checks on incoming messages; defaults to INCREMENTAL_VALIDATION. */
  readonly validation?: ValidationConfig;
}

/**
 * Rejects component types the catalog lacks (reported to `onError`) but allows references,
 * orphans and a missing root that later messages complete — agents stream surfaces in pieces.
 */
export const INCREMENTAL_VALIDATION: ValidationConfig = Object.freeze({
  allowOrphanComponents: true,
  allowDanglingReferences: true,
  allowMissingRoot: true,
  allowUnknownElements: false,
});

/** Wires a transport to an A2UI message processor that renders with the given catalog. */
export function createUiKitRuntime({
  transport,
  catalog = uiKitOneCatalog,
  validation = INCREMENTAL_VALIDATION,
}: UiKitRuntimeOptions): UiKitRuntime {
  const errorListeners = new Set<(error: Error) => void>();
  const processor: MessageProcessor<ReactComponentImplementation> = new MessageProcessor(
    [catalog],
    (action) => {
      const surface = processor.getSurface(action.surfaceId);
      const clientAction: A2uiClientAction = {
        name: action.name,
        surfaceId: action.surfaceId,
        sourceComponentId: action.sourceComponentId,
        timestamp: action.timestamp,
        context: action.context,
      };
      transport.sendAction(
        clientAction,
        surface?.sendDataModel === true ? surface.dataModel.get("/") : undefined,
      );
    },
    { validationConfig: validation },
  );

  const stopMessages = transport.onMessages((messages) => {
    try {
      for (const message of messages)
        processor.processMessages([toCopyOnWrite(processor, message)]);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (errorListeners.size === 0) throw failure;
      for (const listener of errorListeners) listener(failure);
    }
  });

  return {
    processor,
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    dispose() {
      stopMessages();
      processor.dispose();
    },
  };
}
