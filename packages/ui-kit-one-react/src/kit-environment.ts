import { createContext, useContext, type RefObject } from "react";

export interface KitEnvironment {
  /** True when the kit is embedded in a host page (see `UiKitProvider` `mode`). */
  readonly scoped: boolean;
  /** Where overlays (Modal) portal to; `undefined` means the document body. */
  readonly portalContainer: RefObject<HTMLElement | null> | undefined;
}

export const KitEnvironmentContext = createContext<KitEnvironment>({
  scoped: false,
  portalContainer: undefined,
});

export function useKitEnvironment(): KitEnvironment {
  return useContext(KitEnvironmentContext);
}
