import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip.tsx";

/** Icon button that copies `text` and confirms with a check mark. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => void copy()} />
        }
      >
        {copied ? <Check className="text-success-foreground" /> : <Copy />}
      </TooltipTrigger>
      <TooltipPopup>{copied ? "Copied" : label}</TooltipPopup>
    </Tooltip>
  );
}
