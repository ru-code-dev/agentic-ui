import { A2uiSurface, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { SurfaceModel } from "@a2ui/web_core/v0_9";

export interface UiKitSurfaceProps {
  readonly surface: SurfaceModel<ReactComponentImplementation>;
}

/** Renders one A2UI surface with the kit's component implementations. */
export function UiKitSurface({ surface }: UiKitSurfaceProps) {
  return <A2uiSurface surface={surface} />;
}
