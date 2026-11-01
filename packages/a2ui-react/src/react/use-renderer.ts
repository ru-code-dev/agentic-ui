import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { Catalog } from "@a2ui/web_core/v0_9";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SurfaceLog } from "../core/surfaces.ts";
import { createSurfaceRenderer, type RendererEvents, type Surface } from "./renderer.ts";

const NONE: readonly Surface[] = [];
const idle = () => () => {};

/**
 * The live surfaces of `log`, rendered by a renderer created after mount and disposed on unmount (StrictMode
 * safe); `events` may change on every render (the latest one is used).
 */
export function useRenderer(
  log: SurfaceLog,
  events: RendererEvents,
  catalog?: Catalog<ReactComponentImplementation>,
): readonly Surface[] {
  const latest = useRef(events);
  latest.current = events;
  const [renderer, setRenderer] = useState<ReturnType<typeof createSurfaceRenderer>>();
  useEffect(() => {
    const next = createSurfaceRenderer(log, () => latest.current, catalog);
    setRenderer(next);
    return () => {
      next.dispose();
    };
  }, [log, catalog]);
  return useSyncExternalStore(
    renderer?.subscribe ?? idle,
    () => renderer?.surfaces() ?? NONE,
    () => NONE,
  );
}
