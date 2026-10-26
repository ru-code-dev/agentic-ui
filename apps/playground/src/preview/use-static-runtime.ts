import type { UiKitRuntime } from "@agentic-ui/ui-kit-one-react";
import { usePreviewRuntime, type PreviewRuntimeEvents } from "./use-preview-runtime.ts";

const IGNORE: PreviewRuntimeEvents = {
  onAction: () => {},
  onDataModel: () => {},
  onError: () => {},
  onRendered: () => {},
};

/** A runtime for inline previews (catalog cards, detail view) that nothing listens to. */
export function useStaticRuntime(messages: readonly unknown[]): UiKitRuntime | undefined {
  return usePreviewRuntime(messages, 0, IGNORE).runtime;
}
