/**
 * `@agentic-ui/a2ui-react` (SV-C26 layers 2 and 3): React hooks and components over the headless core
 * (`@agentic-ui/a2ui-react/core`), and the scoped kit provider. A client module (`"use client"` in the build).
 * Named exports only (DEC-050).
 */
export {
  UiKitProvider as A2UIKitProvider,
  type UiKitProviderProps as A2UIKitProviderProps,
} from "@agentic-ui/ui-kit-one-react";
export { A2UIChat, type A2UIChatProps, type Placement } from "./a2ui-chat.tsx";
export { A2UISurface, type A2UISurfaceProps, type SurfaceActionEvent } from "./a2ui-surface.tsx";
export type { ChatSlots } from "./chat-parts.tsx";
export { DEFAULT_LABELS, type ChatLabels } from "./labels.ts";
export type { Surface, SurfaceAction } from "./renderer.ts";
export { useA2UIChat, type UseA2UIChat, type UseA2UIChatOptions } from "./use-a2ui-chat.ts";
export {
  useA2UISurfaces,
  type UseA2UISurfaces,
  type UseA2UISurfacesOptions,
} from "./use-a2ui-surfaces.ts";
