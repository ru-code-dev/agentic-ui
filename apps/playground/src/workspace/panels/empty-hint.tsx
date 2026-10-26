import type { LucideIcon } from "lucide-react";

/** Centered empty state for a bottom-panel tab. */
export function EmptyHint({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <div className="grid h-full min-h-32 place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <div className="grid size-9 place-items-center rounded-lg border bg-card">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <p className="font-medium text-[13px]">{title}</p>
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
