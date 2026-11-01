import type { ComponentRole } from "../prop-kinds.ts";
import { AvatarApi } from "./avatar.ts";
import { BoxApi } from "./box.ts";
import { ButtonApi } from "./button.ts";
import { CenterApi } from "./center.ts";
import { CheckboxApi } from "./checkbox.ts";
import { ContainerApi } from "./container.ts";
import { FlexApi } from "./flex.ts";
import { GridApi } from "./grid.ts";
import { HeadingApi } from "./heading.ts";
import { IconApi } from "./icon.ts";
import { InputApi } from "./input.ts";
import { ListApi } from "./list.ts";
import { ModalApi } from "./modal.ts";
import { RadioGroupApi } from "./radio-group.ts";
import { SwitchApi } from "./switch.ts";
import { TableApi } from "./table.ts";
import { TabsApi } from "./tabs.ts";
import { TagApi } from "./tag.ts";
import { TextApi } from "./text.ts";

export {
  AvatarApi,
  BoxApi,
  ButtonApi,
  CenterApi,
  CheckboxApi,
  ContainerApi,
  FlexApi,
  GridApi,
  HeadingApi,
  IconApi,
  InputApi,
  ListApi,
  ModalApi,
  RadioGroupApi,
  SwitchApi,
  TableApi,
  TabsApi,
  TagApi,
  TextApi,
};

/** Every component of the contract, in catalog order: layout, typography, actions, inputs, data, overlays, media. */
export const COMPONENT_APIS = [
  BoxApi,
  CenterApi,
  ContainerApi,
  FlexApi,
  GridApi,
  HeadingApi,
  TextApi,
  ButtonApi,
  InputApi,
  CheckboxApi,
  RadioGroupApi,
  SwitchApi,
  ListApi,
  TableApi,
  TagApi,
  ModalApi,
  TabsApi,
  AvatarApi,
  IconApi,
];

/** What each component is for (SV-C22); the catalog rules name components through their role. */
export const COMPONENT_ROLES: Readonly<Record<string, ComponentRole>> = {
  Box: "layout",
  Center: "layout",
  Container: "page",
  Flex: "layout",
  Grid: "layout",
  Heading: "text",
  Text: "text",
  Button: "action",
  Input: "input",
  Checkbox: "input",
  RadioGroup: "input",
  Switch: "input",
  List: "data",
  Table: "data",
  Tag: "status",
  Modal: "overlay",
  Tabs: "overlay",
  Avatar: "media",
  Icon: "media",
};
