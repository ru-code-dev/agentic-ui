import type { ReactNode } from "react";

/** The 40px header strip of a workspace pane. */
export function PaneHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">{children}</div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      )}
    </div>
  );
}
