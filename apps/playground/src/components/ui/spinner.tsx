import { type ComponentProps, type ElementRef, type ReactElement, forwardRef } from "react";
import { Loader2Icon } from "lucide-react";
import { cn } from "~/lib/utils";

export const Spinner = forwardRef<
  ElementRef<typeof Loader2Icon>,
  ComponentProps<typeof Loader2Icon>
>(function Spinner({ className, ...props }, ref): ReactElement {
  return (
    <Loader2Icon
      ref={ref}
      aria-label="Loading"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
});
