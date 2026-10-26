import { mapping as button } from "./components/button.tsx";
import { mapping as checkbox } from "./components/checkbox.tsx";
import { mapping as icon } from "./components/icon.tsx";
import { mapping as input } from "./components/input.tsx";
import { mapping as list } from "./components/list.tsx";
import { mapping as modal } from "./components/modal.tsx";
import { mapping as radioGroup } from "./components/radio-group.tsx";
import { mapping as switchMapping } from "./components/switch.tsx";
import { mapping as table } from "./components/table.tsx";
import { mapping as tabs } from "./components/tabs.tsx";
import type { ComponentMapping } from "./mapping.ts";
import { PASSTHROUGH } from "./passthrough-components.ts";

/** Every component's contract → kit mapping, in contract order (source of MAPPING.md). */
export const COMPONENT_MAPPINGS: readonly ComponentMapping[] = [
  PASSTHROUGH.Box.mapping,
  PASSTHROUGH.Center.mapping,
  PASSTHROUGH.Container.mapping,
  PASSTHROUGH.Flex.mapping,
  PASSTHROUGH.Grid.mapping,
  PASSTHROUGH.Heading.mapping,
  PASSTHROUGH.Text.mapping,
  button,
  input,
  checkbox,
  radioGroup,
  switchMapping,
  list,
  table,
  PASSTHROUGH.Tag.mapping,
  modal,
  tabs,
  PASSTHROUGH.Avatar.mapping,
  icon,
];
