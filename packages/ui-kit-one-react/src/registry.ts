import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import { COMPONENT_APIS } from "@agentic-ui/ui-kit-one-catalog";
import { Button, mapping as button } from "./components/button.tsx";
import { Checkbox, mapping as checkbox } from "./components/checkbox.tsx";
import { Icon, mapping as icon } from "./components/icon.tsx";
import { Input, mapping as input } from "./components/input.tsx";
import { List, mapping as list } from "./components/list.tsx";
import { Modal, mapping as modal } from "./components/modal.tsx";
import { RadioGroup, mapping as radioGroup } from "./components/radio-group.tsx";
import { Switch, mapping as switchMapping } from "./components/switch.tsx";
import { Table, mapping as table } from "./components/table.tsx";
import { Tabs, mapping as tabs } from "./components/tabs.tsx";
import type { ComponentMapping } from "./mapping.ts";
import { PASSTHROUGH } from "./passthrough-components.ts";

export interface RegistryEntry {
  readonly implementation: ReactComponentImplementation;
  readonly mapping: ComponentMapping;
}

/** Components that need A2UI-specific translation (DEC-005): one line each. */
const CUSTOM: Readonly<Record<string, RegistryEntry>> = {
  Button: { implementation: Button, mapping: button },
  Input: { implementation: Input, mapping: input },
  Checkbox: { implementation: Checkbox, mapping: checkbox },
  RadioGroup: { implementation: RadioGroup, mapping: radioGroup },
  Switch: { implementation: Switch, mapping: switchMapping },
  List: { implementation: List, mapping: list },
  Table: { implementation: Table, mapping: table },
  Modal: { implementation: Modal, mapping: modal },
  Tabs: { implementation: Tabs, mapping: tabs },
  Icon: { implementation: Icon, mapping: icon },
};

/**
 * The single component registry (DEC-007): pure-data components come from PASSTHROUGH, the rest
 * from CUSTOM. Swapping passthrough ↔ custom moves one line; nothing else lists components.
 */
export const COMPONENT_REGISTRY: Readonly<Record<string, RegistryEntry>> = {
  ...PASSTHROUGH,
  ...CUSTOM,
};

/** Entries of `registry` in the order of `apis`; throws when a contract component has none. */
export function registeredFor(
  apis: readonly { readonly name: string }[],
  registry: Readonly<Record<string, RegistryEntry>>,
): RegistryEntry[] {
  const extra = Object.keys(registry).filter((name) => !apis.some((api) => api.name === name));
  if (extra.length > 0) throw new Error(`not in the contract: ${extra.join(", ")}`);
  return apis.map((api) => {
    const entry = registry[api.name];
    if (entry === undefined) throw new Error(`${api.name} has no renderer entry (src/registry.ts)`);
    return entry;
  });
}

/** The registry in contract order. */
export const REGISTERED: readonly RegistryEntry[] = registeredFor(
  COMPONENT_APIS,
  COMPONENT_REGISTRY,
);
