/**
 * A4-26: a component that throws while rendering (a bound value of another type: an object as a
 * Button label, a number as an Avatar name) is replaced by a small placeholder of its own; the rest
 * of the surface stays. Every registered implementation is wrapped (catalog.ts). The error goes to
 * the `onComponentError` listeners (the page shows it and may ask the agent for a repair, DEC-063).
 * Plain HTML only: the kit boundary keeps Chakra inside src/kit/.
 */
import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import { Component, type ErrorInfo, type FC, type ReactNode } from "react";

export interface ComponentError {
  readonly component: string;
  readonly id: string | undefined;
  readonly message: string;
  /**
   * The SurfaceModel the component belongs to (undefined when its render props carry no context): compare by
   * identity to scope a listener to one surface or one chat (PKG-A-O2; ids repeat across surfaces and chats).
   */
  readonly surface: unknown;
}

const listeners = new Set<(error: ComponentError) => void>();

/** Subscribes to component render failures; returns the unsubscribe function. */
export function onComponentError(listener: (error: ComponentError) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface BoundaryProps {
  readonly component: string;
  readonly id: string | undefined;
  readonly surface: unknown;
  readonly children: ReactNode;
}

class ComponentBoundary extends Component<BoundaryProps, { message: string | undefined }> {
  override state: { message: string | undefined } = { message: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo) {
    const message = error instanceof Error ? error.message : String(error);
    const { component, id, surface } = this.props;
    const failure = { component, id, message, surface };
    for (const listener of listeners) listener(failure);
  }

  override render() {
    if (this.state.message === undefined) return this.props.children;
    const { component, id } = this.props;
    return (
      <span
        role="alert"
        data-testid="component-failed"
        data-component={component}
        style={{
          display: "inline-block",
          padding: "2px 6px",
          border: "1px dashed currentColor",
          borderRadius: 4,
          fontSize: 12,
          opacity: 0.8,
        }}
      >
        {`${component}${id === undefined ? "" : ` «${id}»`} не отрисован: ${this.state.message}`}
      </span>
    );
  }
}

interface Context {
  readonly componentModel?: { readonly id?: unknown };
  readonly dataContext?: { readonly surface?: unknown };
}

/** The component id and its surface from render props (`context`) or node-view props (`node.context`). */
const originOf = (props: object) => {
  const { node, context: own } = props as {
    node?: { componentId?: unknown; context?: Context };
    context?: Context;
  };
  const context = node?.context ?? own;
  const id = node?.componentId ?? context?.componentModel?.id;
  return { id: typeof id === "string" ? id : undefined, surface: context?.dataContext?.surface };
};

function guard<P extends object>(name: string, Inner: FC<P>): FC<P> {
  const Guarded: FC<P> = (props) => (
    <ComponentBoundary component={name} {...originOf(props)}>
      <Inner {...props} />
    </ComponentBoundary>
  );
  Guarded.displayName = `Guarded(${name})`;
  return Guarded;
}

/** The implementation with its render (and node view) behind a per-component boundary. */
export function guarded(
  implementation: ReactComponentImplementation,
): ReactComponentImplementation {
  const { name, render, view } = implementation;
  return Object.assign(Object.create(Object.getPrototypeOf(implementation)), implementation, {
    render: guard(name, render),
    ...(view === undefined ? {} : { view: guard(name, view) }),
  }) as ReactComponentImplementation;
}
