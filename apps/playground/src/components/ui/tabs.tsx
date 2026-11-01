"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import {
  type Context,
  type ElementRef,
  type ReactElement,
  createContext,
  forwardRef,
  useContext,
} from "react";
import { cn } from "~/lib/utils";
import {
  type SegmentedControlSize,
  segmentedControlIndicatorSurfaceClassName,
  segmentedControlItemLayoutClassName,
  segmentedControlItemSizeClassNames,
} from "~/components/ui/segmented-control";

type TabsVariant = "default" | "underline";
type TabsSize = SegmentedControlSize;

const TabsListContext: Context<TabsSize> = createContext<TabsSize>("default");

export const Tabs = forwardRef<ElementRef<typeof TabsPrimitive.Root>, TabsPrimitive.Root.Props>(
  function Tabs({ className, ...props }, ref): ReactElement {
    return (
      <TabsPrimitive.Root
        ref={ref}
        className={cn("flex flex-col gap-2 data-[orientation=vertical]:flex-row", className)}
        data-slot="tabs"
        {...props}
      />
    );
  },
);

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  TabsPrimitive.List.Props & {
    size?: TabsSize;
    variant?: TabsVariant;
  }
>(function TabsList(
  { variant = "default", size = "default", className, children, ...props },
  ref,
): ReactElement {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "relative z-0 flex w-fit items-center justify-center gap-x-0.5 text-muted-foreground",
        "data-[orientation=vertical]:flex-col",
        variant === "default"
          ? "rounded-lg bg-muted p-0.5 text-muted-foreground/72"
          : "data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1 *:data-[slot=tabs-tab]:hover:bg-accent",
        className,
      )}
      data-size={size}
      data-slot="tabs-list"
      {...props}
    >
      <TabsListContext.Provider value={size}>{children}</TabsListContext.Provider>
      <TabsPrimitive.Indicator
        className={cn(
          "absolute bottom-0 left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-(--active-tab-bottom) transition-[width,translate] duration-200 ease-in-out motion-reduce:transition-none",
          variant === "underline"
            ? "z-10 bg-primary data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:-translate-x-px data-[orientation=horizontal]:translate-y-px"
            : cn("-z-1", segmentedControlIndicatorSurfaceClassName),
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  );
});

export const TabsTab = forwardRef<
  ElementRef<typeof TabsPrimitive.Tab>,
  TabsPrimitive.Tab.Props & {
    size?: TabsSize;
  }
>(function TabsTab({ className, size, ...props }, ref): ReactElement {
  const contextSize: TabsSize = useContext(TabsListContext);
  const resolvedSize: TabsSize = size ?? contextSize;

  return (
    <TabsPrimitive.Tab
      ref={ref}
      className={cn(
        "relative flex shrink-0 grow cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-transparent font-medium text-[13px] outline-none transition-[color,background-color,box-shadow] hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start data-active:text-foreground data-disabled:opacity-64",
        segmentedControlItemLayoutClassName,
        segmentedControlItemSizeClassNames[resolvedSize],
        className,
      )}
      data-size={resolvedSize}
      data-slot="tabs-tab"
      {...props}
    />
  );
});

export const TabsPanel = forwardRef<
  ElementRef<typeof TabsPrimitive.Panel>,
  TabsPrimitive.Panel.Props
>(function TabsPanel({ className, ...props }, ref): ReactElement {
  return (
    <TabsPrimitive.Panel
      ref={ref}
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
});

export {
  TabsPrimitive,
  TabsTab as TabsTrigger,
  TabsPanel as TabsContent,
  type TabsSize,
  type TabsVariant,
};
