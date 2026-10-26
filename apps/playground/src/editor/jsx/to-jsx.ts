import { componentElement } from "./elements.ts";
import { bindingExpression, type Scope } from "./expressions.ts";
import { element, mapNode, printJsx, type JsxChild, type JsxNode } from "./nodes.ts";

type Component = Readonly<Record<string, unknown>> & {
  readonly id: string;
  readonly component: string;
};

/** Components of every surface after all updateComponents messages, keyed by id. */
function collectSurfaces(messages: readonly unknown[]): Map<string, Map<string, Component>> {
  const surfaces = new Map<string, Map<string, Component>>();
  for (const message of messages) {
    const update = (
      message as { updateComponents?: { surfaceId: string; components: Component[] } }
    ).updateComponents;
    if (update === undefined || !Array.isArray(update.components)) continue;
    const components = surfaces.get(update.surfaceId) ?? new Map<string, Component>();
    for (const component of update.components) components.set(component.id, component);
    surfaces.set(update.surfaceId, components);
  }
  return surfaces;
}

function surfaceTree(components: ReadonlyMap<string, Component>): JsxNode {
  const visiting = new Set<string>();
  const render = (id: string, scope: Scope): JsxNode => {
    const component = components.get(id);
    if (component === undefined || visiting.has(id))
      return element(`Missing id=${JSON.stringify(id)}`);
    visiting.add(id);
    const { id: _id, component: name, ...props } = component;
    const node = componentElement(name, props, scope, render, children);
    visiting.delete(id);
    return node;
  };
  const children = (
    value: unknown,
    scope: Scope,
    wrap: (child: JsxNode) => JsxNode = (child) => child,
  ): JsxChild[] => {
    if (Array.isArray(value)) return value.map((id) => wrap(render(String(id), scope)));
    if (typeof value === "object" && value !== null && "componentId" in value && "path" in value) {
      const template = value as { componentId: string; path: string };
      const item = scope.item === undefined ? "item" : `${scope.item}Child`;
      return [
        mapNode(
          bindingExpression(template.path, scope),
          item,
          wrap(render(template.componentId, { item })),
        ),
      ];
    }
    return [];
  };
  return render("root", { item: undefined });
}

/**
 * The read-only JSX equivalent of A2UI messages (PG-21): each surface's tree with the kit
 * components the renderer renders, bindings as `data.*` reads and actions as `send(...)` calls.
 */
export function messagesToJsx(messages: readonly unknown[]): string {
  const blocks = [...collectSurfaces(messages)].map(
    ([surfaceId, components]) =>
      `// Surface "${surfaceId}" — data = its data model\n${printJsx(surfaceTree(components))}`,
  );
  return blocks.length === 0 ? "// No updateComponents message yet" : blocks.join("\n\n");
}
