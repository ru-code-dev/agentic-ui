import { UiKitSurface, useSurfaces, type UiKitRuntime } from "@agentic-ui/ui-kit-one-react";

/** Every live surface of a runtime. */
export function RuntimeSurfaces({ runtime }: { runtime: UiKitRuntime }) {
  const surfaces = useSurfaces(runtime);
  return (
    <>
      {surfaces.map((surface) => (
        <UiKitSurface key={surface.id} surface={surface} />
      ))}
    </>
  );
}
