export { COMPONENT_IMPLEMENTATIONS, uiKitOneCatalog } from "./catalog.ts";
export { onComponentError, type ComponentError } from "./component-boundary.tsx";
export {
  DEFAULT_COLOR_MODE,
  PAGE_BACKGROUND,
  UI_KIT_ROOT_ATTRIBUTE,
  UiKitProvider,
  type ColorMode,
  type UiKitProviderProps,
} from "./provider.tsx";
export {
  INCREMENTAL_VALIDATION,
  createUiKitRuntime,
  type UiKitRuntime,
  type UiKitRuntimeOptions,
} from "./runtime/runtime.ts";
export { UiKitSurface, type UiKitSurfaceProps } from "./runtime/surface.tsx";
export { LocalTransport, type SentAction, type Transport } from "./runtime/transport.ts";
export { useSurfaces } from "./runtime/use-surfaces.ts";
export { ICON_KIT_NAMES } from "./icon-map.ts";
export type { ComponentMapping, PropMapping } from "./mapping.ts";
export { COMPONENT_MAPPINGS } from "./mappings.ts";
export { COMPONENT_REGISTRY, registeredFor, type RegistryEntry } from "./registry.ts";
export { PASSTHROUGH } from "./passthrough-components.ts";
