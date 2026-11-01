import { COMPONENT_APIS } from "./components/index.ts";
import { twoWayBindings } from "./contract-view.ts";

/**
 * Two-way bindings of the contract: props a renderer writes back to their bound data-model path
 * when the user changes them. Derived from the `two-way` prop kinds (prop-kinds.ts); every other
 * dynamic prop is read-only for the renderer.
 */
export const TWO_WAY_BINDINGS: Readonly<Record<string, readonly string[]>> =
  twoWayBindings(COMPONENT_APIS);
