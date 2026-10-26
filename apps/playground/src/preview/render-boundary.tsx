import { Component, type ReactNode } from "react";

interface Props {
  readonly children: ReactNode;
  readonly onError: (message: string) => void;
}

/** Keeps a component that throws while rendering from blanking the whole preview. */
export class RenderBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    this.props.onError(error.message);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
