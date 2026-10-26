/** Kit facade: tabs and their parts. */
import {
  Tab as ChakraTab,
  TabList as ChakraTabList,
  TabPanel as ChakraTabPanel,
  TabPanels as ChakraTabPanels,
  Tabs as ChakraTabs,
  type TabsProps,
} from "@chakra-ui/react";
import type { ComponentType } from "react";
import type { WithChildren } from "./types.ts";

export const Tabs: ComponentType<
  Pick<TabsProps, "index" | "onChange" | "variant" | "colorScheme" | "children">
> = ChakraTabs;
export const TabList: ComponentType<WithChildren> = ChakraTabList;
export const Tab: ComponentType<WithChildren> = ChakraTab;
export const TabPanels: ComponentType<WithChildren> = ChakraTabPanels;
export const TabPanel: ComponentType<WithChildren> = ChakraTabPanel;
