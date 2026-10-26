import type { ReactComponentImplementation } from "@a2ui/react/v0_9";
import { createBasicCatalogFunctions } from "@a2ui/web_core/v0_9/basic_catalog";
import { Catalog, type FunctionImplementation } from "@a2ui/web_core/v0_9";
import {
  CATALOG_ID,
  CATALOG_OPTIONS,
  FUNCTION_APIS,
  PROTOCOL_VERSION,
  tokens,
} from "@agentic-ui/ui-kit-one-catalog";
import { Button } from "./components/button.tsx";
import { Checkbox } from "./components/checkbox.tsx";
import { Icon } from "./components/icon.tsx";
import { Input } from "./components/input.tsx";
import { List } from "./components/list.tsx";
import { Modal } from "./components/modal.tsx";
import { RadioGroup } from "./components/radio-group.tsx";
import { Switch } from "./components/switch.tsx";
import { Table } from "./components/table.tsx";
import { PASSTHROUGH } from "./passthrough-components.ts";
import { Tabs } from "./components/tabs.tsx";

const contractFunctionNames = new Set<string>(FUNCTION_APIS.map((api) => api.name));

/** Implementations in contract order. */
export const COMPONENT_IMPLEMENTATIONS: readonly ReactComponentImplementation[] = [
  PASSTHROUGH.Box.implementation,
  PASSTHROUGH.Center.implementation,
  PASSTHROUGH.Container.implementation,
  PASSTHROUGH.Flex.implementation,
  PASSTHROUGH.Grid.implementation,
  PASSTHROUGH.Heading.implementation,
  PASSTHROUGH.Text.implementation,
  Button,
  Input,
  Checkbox,
  RadioGroup,
  Switch,
  List,
  Table,
  PASSTHROUGH.Tag.implementation,
  Modal,
  Tabs,
  PASSTHROUGH.Avatar.implementation,
  Icon,
];

/**
 * ui-kit-one rendered with Chakra UI v1: one implementation per contract component, and the A2UI
 * basic functions formatting with the contract locale (ru-RU).
 */
export const uiKitOneCatalog = new Catalog<ReactComponentImplementation, FunctionImplementation>(
  CATALOG_ID,
  PROTOCOL_VERSION,
  [...COMPONENT_IMPLEMENTATIONS],
  createBasicCatalogFunctions({ locale: tokens.formatting.locale }).filter((fn) =>
    contractFunctionNames.has(fn.name),
  ),
  CATALOG_OPTIONS,
);
