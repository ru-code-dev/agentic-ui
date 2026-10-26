import { Fragment, type ReactNode } from "react";

/** A resolved ChildList entry: a static component id, or a template instance with its data path. */
export type ChildRef = string | { readonly id: string; readonly basePath: string };

/** Renders resolved children in order, optionally wrapping each one (e.g. in a list item). */
export function renderChildren(
  children: readonly ChildRef[] | undefined,
  buildChild: (id: string, basePath?: string) => ReactNode,
  wrap: (child: ReactNode, key: string) => ReactNode = (child, key) => (
    <Fragment key={key}>{child}</Fragment>
  ),
): ReactNode {
  return (children ?? []).map((child, index) =>
    typeof child === "string"
      ? wrap(buildChild(child), `${child}-${index}`)
      : wrap(buildChild(child.id, child.basePath), `${child.id}-${child.basePath}`),
  );
}
