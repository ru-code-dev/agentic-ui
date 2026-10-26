import { createComponentImplementation } from "@a2ui/react/v0_9";
import { TabsApi } from "@agentic-ui/ui-kit-one-catalog";
import { useState } from "react";
import {
  Tab as KitTab,
  TabList as KitTabList,
  TabPanel as KitTabPanel,
  TabPanels as KitTabPanels,
  Tabs as KitTabs,
} from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";

export const mapping = componentMapping(
  TabsApi,
  ["Tabs", "TabList", "Tab", "TabPanels", "TabPanel"],
  {
    tabs: { kit: "Tab + TabPanel per tab", note: "title → Tab children, child → TabPanel content" },
    selectedIndex: {
      kit: "Tabs index / onChange",
      note: "two-way when bound; otherwise local state starting at 0",
    },
  },
);

export const Tabs = createComponentImplementation(TabsApi, ({ props, buildChild }) => {
  const [localIndex, setLocalIndex] = useState(0);
  const isBound = props.selectedIndex !== undefined;
  const index = isBound ? Number(props.selectedIndex) : localIndex;
  return (
    <KitTabs
      index={index}
      onChange={(next) => (isBound ? props.setSelectedIndex(next) : setLocalIndex(next))}
      {...identityProps(KitTabs, props, mapping.identityKeys)}
    >
      <KitTabList>
        {props.tabs.map((tab) => (
          // The binder resolves the nested DynamicString titles; the prop type does not reach them.
          <KitTab key={tab.child}>{String(tab.title)}</KitTab>
        ))}
      </KitTabList>
      <KitTabPanels>
        {props.tabs.map((tab) => (
          <KitTabPanel key={tab.child}>{buildChild(tab.child)}</KitTabPanel>
        ))}
      </KitTabPanels>
    </KitTabs>
  );
});
