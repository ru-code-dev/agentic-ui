import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { toAppPath, toUrlPath } from "./base-path.ts";

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
window.addEventListener("popstate", notify);

/** Client-side navigation with the History API (the production server falls back to index.html). */
export function navigate(to: string): void {
  if (to === toAppPath(location.pathname)) return;
  history.pushState(null, "", toUrlPath(to));
  notify();
}

export function usePathname(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toAppPath(location.pathname),
  );
}

export function Link({
  to,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={toUrlPath(to)} onClick={handleClick} {...props} />;
}
