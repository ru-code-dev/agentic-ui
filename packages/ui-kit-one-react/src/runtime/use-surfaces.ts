import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { SurfaceModel } from "@a2ui/web_core/v0_9";
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { UiKitRuntime } from "./runtime.ts";

type Surface = SurfaceModel<ReactComponentImplementation>;

/** The runtime's live surfaces, in creation order. */
export function useSurfaces(runtime: UiKitRuntime): readonly Surface[] {
  const snapshot = useRef<readonly Surface[]>([]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const refresh = () => {
        snapshot.current = [...runtime.processor.getSurfaces().values()];
        onChange();
      };
      refresh();
      const created = runtime.processor.onSurfaceCreated(refresh);
      const deleted = runtime.processor.onSurfaceDeleted(refresh);
      return () => {
        created.unsubscribe();
        deleted.unsubscribe();
      };
    },
    [runtime],
  );
  return useSyncExternalStore(subscribe, () => snapshot.current);
}
