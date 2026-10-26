import type { ReactNode } from "react";
import { Button } from "./ui/button.tsx";
import { Kbd } from "./ui/kbd.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

interface IconButtonProps {
  readonly label: string;
  readonly shortcut?: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly pressed?: boolean;
}

/** Toolbar icon button with a tooltip (and keyboard shortcut hint). */
export function IconButton({ label, shortcut, onClick, children, pressed }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            className={pressed === true ? "bg-accent text-foreground" : "text-muted-foreground"}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup className="flex items-center gap-2">
        {label}
        {shortcut === undefined ? null : <Kbd>{shortcut}</Kbd>}
      </TooltipPopup>
    </Tooltip>
  );
}
