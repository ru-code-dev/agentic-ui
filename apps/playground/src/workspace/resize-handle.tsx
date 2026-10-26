import { Separator } from "react-resizable-panels";
import { cn } from "../lib/utils.ts";

/** A 1px divider with a wider invisible grab area and a brand-colored active state. */
export function ResizeHandle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  return (
    <Separator
      className={cn(
        "relative shrink-0 bg-border outline-none transition-colors data-[separator=active]:bg-brand data-[separator=hover]:bg-white/20",
        orientation === "horizontal"
          ? "w-px after:absolute after:inset-y-0 after:-inset-x-1.5"
          : "h-px after:absolute after:inset-x-0 after:-inset-y-1.5",
      )}
    />
  );
}
