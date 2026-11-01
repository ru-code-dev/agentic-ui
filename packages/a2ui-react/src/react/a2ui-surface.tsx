import { onComponentError, UiKitSurface } from "@agentic-ui/ui-kit-one-react";
import { Component, useEffect, useRef, type ReactNode } from "react";
import type { Surface } from "./renderer.ts";

export interface SurfaceActionEvent {
  readonly name: string;
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly context: unknown;
  /** The surface's data model when it was created with `sendDataModel: true`. */
  readonly dataModel: unknown;
}

export interface A2UISurfaceProps {
  readonly surface: Surface;
  readonly onAction?: (action: SurfaceActionEvent) => void;
  /** Every change of the surface's data model (inputs included), as plain JSON. */
  readonly onDataModelChange?: (dataModel: unknown) => void;
  /** Expression errors, a component of this surface that failed to render, or the whole surface failing. */
  readonly onError?: (message: string) => void;
  /** Shown instead of the surface when it fails to render as a whole (default: a small alert). */
  readonly fallback?: (message: string) => ReactNode;
}

const plain = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

class SurfaceBoundary extends Component<
  {
    onError: (message: string) => void;
    fallback: (message: string) => ReactNode;
    children: ReactNode;
  },
  { failed: string | undefined }
> {
  override state: { failed: string | undefined } = { failed: undefined };
  static getDerivedStateFromError(error: unknown) {
    return { failed: error instanceof Error ? error.message : String(error) };
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }
  override render() {
    return this.state.failed === undefined
      ? this.props.children
      : this.props.fallback(this.state.failed);
  }
}

const defaultFallback = (message: string) => (
  <div role="alert" data-testid="a2ui-surface-failed" style={{ padding: 8, fontSize: 13 }}>
    {message}
  </div>
);

/**
 * SV-C26: one A2UI surface rendered with the kit (inside an `A2UIKitProvider` or the host's own provider).
 * Never a white page (DEC-054): a component that throws shows its own placeholder, a surface that throws as a
 * whole shows `fallback`.
 */
export function A2UISurface({
  surface,
  onAction,
  onDataModelChange,
  onError,
  fallback,
}: A2UISurfaceProps) {
  const handlers = useRef({ onAction, onDataModelChange, onError });
  handlers.current = { onAction, onDataModelChange, onError };
  useEffect(() => {
    const action = surface.onAction.subscribe((payload) =>
      handlers.current.onAction?.({
        name: payload.name,
        surfaceId: payload.surfaceId,
        sourceComponentId: payload.sourceComponentId,
        context: plain(payload.context),
        dataModel: surface.sendDataModel ? plain(surface.dataModel.get("/")) : undefined,
      }),
    );
    // Prefixed like the chat renderer's own report, so a chat that hears both repairs it once (A5-03).
    const failed = surface.onError.subscribe((error) =>
      handlers.current.onError?.(`${surface.id}: ${error.message}`),
    );
    const data = surface.dataModel.subscribe("/", (value) =>
      handlers.current.onDataModelChange?.(plain(value)),
    );
    const component = onComponentError(({ component: name, id, message, surface: origin }) => {
      if (origin === surface)
        handlers.current.onError?.(`${name}${id ? ` «${id}»` : ""}: ${message}`);
    });
    return () => {
      action.unsubscribe();
      failed.unsubscribe();
      data.unsubscribe();
      component();
    };
  }, [surface]);
  return (
    <SurfaceBoundary
      key={surface.id}
      onError={(message) => handlers.current.onError?.(message)}
      fallback={fallback ?? defaultFallback}
    >
      <UiKitSurface surface={surface} />
    </SurfaceBoundary>
  );
}
