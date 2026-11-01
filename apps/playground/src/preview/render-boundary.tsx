import { Component, type ReactNode } from "react";

interface Props {
  readonly children: ReactNode;
  readonly onError: (message: string) => void;
  /** What to show instead of the children after a render error (default: nothing). */
  readonly fallback?: ((message: string) => ReactNode) | undefined;
}

/** Keeps a component that throws while rendering from blanking the whole preview (or app). */
export class RenderBoundary extends Component<Props, { failed: string | undefined }> {
  override state: { failed: string | undefined } = { failed: undefined };

  static getDerivedStateFromError(error: unknown): { failed: string } {
    return { failed: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError(error.message);
  }

  override render(): ReactNode {
    if (this.state.failed === undefined) return this.props.children;
    return this.props.fallback?.(this.state.failed) ?? null;
  }
}
