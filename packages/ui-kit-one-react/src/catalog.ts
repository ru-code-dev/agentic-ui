import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import { createBasicCatalogFunctions } from "@a2ui/web_core/v0_9/basic_catalog";
import { Catalog, type FunctionImplementation } from "@a2ui/web_core/v0_9";
import {
  CATALOG_ID,
  CATALOG_OPTIONS,
  FUNCTION_APIS,
  PROTOCOL_VERSION,
  formatting,
} from "@agentic-ui/ui-kit-one-catalog";
import { guarded } from "./component-boundary.tsx";
import { REGISTERED } from "./registry.ts";
import { totalFunctions } from "./total-functions.ts";

const contractFunctionNames = new Set<string>(FUNCTION_APIS.map((api) => api.name));

/**
 * Implementations in contract order (from the single registry, src/registry.ts), each behind a
 * per-component error boundary (A4-26, component-boundary.tsx).
 */
export const COMPONENT_IMPLEMENTATIONS: readonly ReactComponentImplementation[] = REGISTERED.map(
  (entry) => guarded(entry.implementation),
);

/**
 * ui-kit-one rendered with Chakra UI v1: one implementation per contract component, and the A2UI
 * basic functions formatting with the contract locale (ru-RU), made total for empty form values
 * (A6-02, total-functions.ts).
 */
export const uiKitOneCatalog = new Catalog<ReactComponentImplementation, FunctionImplementation>(
  CATALOG_ID,
  PROTOCOL_VERSION,
  [...COMPONENT_IMPLEMENTATIONS],
  totalFunctions(
    createBasicCatalogFunctions({ locale: formatting.locale }).filter((fn) =>
      contractFunctionNames.has(fn.name),
    ),
  ),
  CATALOG_OPTIONS,
);
