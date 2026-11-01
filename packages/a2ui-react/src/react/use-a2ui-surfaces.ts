import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { Catalog } from "@a2ui/web_core/v0_9";
import { useState } from "react";
import { createSurfaceLog, type ApplyResult } from "../core/surfaces.ts";
import type { Surface, SurfaceAction } from "./renderer.ts";
import { useRenderer } from "./use-renderer.ts";

export interface UseA2UISurfacesOptions {
  /** Every surface action (button events), with the surface's data model when it sends one. */
  readonly onAction?: (action: SurfaceAction) => void;
  /** Expression, processing and component render errors of the shown surfaces. */
  readonly onError?: (message: string) => void;
  /** A host's own kit catalog (REMAP kit swap); default: ui-kit-one. */
  readonly catalog?: Catalog<ReactComponentImplementation>;
}

export interface UseA2UISurfaces {
  /** The live surfaces in creation order (render each with `<A2UISurface>`). */
  readonly surfaces: readonly Surface[];
  /**
   * SV-C28: merges `messages` into a copy of the surfaces and checks the WHOLE merged state first; valid →
   * applied (created / updated in place by surfaceId), invalid → nothing changes, the errors are returned.
   */
  readonly apply: (messages: readonly unknown[]) => ApplyResult;
}

/** SV-C26: surfaces for a host's own chat (its own transport or LLM; `extractA2UI` reads a model reply). */
export function useA2UISurfaces({
  onAction,
  onError,
  catalog,
}: UseA2UISurfacesOptions = {}): UseA2UISurfaces {
  const [log] = useState(createSurfaceLog);
  const surfaces = useRenderer(
    log,
    { onAction: (action) => onAction?.(action), onError: (message) => onError?.(message) },
    catalog,
  );
  return { surfaces, apply: log.apply };
}
