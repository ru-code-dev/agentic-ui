import { type ComponentProps, type ElementRef, type ReactElement, forwardRef } from "react";
import { cn } from "~/lib/utils";

export const Kbd = forwardRef<ElementRef<"kbd">, ComponentProps<"kbd">>(function Kbd(
  { className, ...props },
  ref,
): ReactElement {
  return (
    <kbd
      ref={ref}
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded-[.25rem] bg-muted px-1 font-medium font-sans text-muted-foreground text-xs [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      data-slot="kbd"
      {...props}
    />
  );
});
