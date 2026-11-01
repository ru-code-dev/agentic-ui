import type { ComponentMapping } from "./mapping.ts";
import { REGISTERED } from "./registry.ts";

/** Every component's contract → kit mapping, in contract order (source of MAPPING.md). */
export const COMPONENT_MAPPINGS: readonly ComponentMapping[] = REGISTERED.map(
  (entry) => entry.mapping,
);
