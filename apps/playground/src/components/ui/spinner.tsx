import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { cn } from "~/lib/utils";

export const Spinner = React.forwardRef<
  React.ElementRef<typeof Loader2Icon>,
  React.ComponentProps<typeof Loader2Icon>
>(function Spinner({ className, ...props }, ref): React.ReactElement {
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
