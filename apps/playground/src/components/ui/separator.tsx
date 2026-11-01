import { type ElementRef, type ReactElement, forwardRef } from "react";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "~/lib/utils";

export const Separator = forwardRef<
  ElementRef<typeof SeparatorPrimitive>,
  SeparatorPrimitive.Props
>(function Separator({ className, orientation = "horizontal", ...props }, ref): ReactElement {
  return (
    <SeparatorPrimitive
      ref={ref}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:not-[[class^='h-']]:not-[[class*='_h-']]:self-stretch",
        className,
      )}
      data-slot="separator"
      orientation={orientation}
      {...props}
    />
  );
});

export { SeparatorPrimitive };
