/** A tiny JSX syntax tree and its pretty printer. */
export type JsxChild = JsxNode | string;

export type JsxNode =
  | {
      readonly kind: "element";
      readonly name: string;
      readonly attributes: readonly string[];
      readonly children: readonly JsxChild[];
    }
  | { readonly kind: "map"; readonly list: string; readonly item: string; readonly body: JsxNode };

export const element = (
  name: string,
  attributes: readonly string[] = [],
  children: readonly JsxChild[] = [],
): JsxNode => ({
  kind: "element",
  name,
  attributes,
  children: children.filter((child) => child !== ""),
});

export const fragment = (children: readonly JsxChild[]): JsxNode => element("", [], children);

export const mapNode = (list: string, item: string, body: JsxNode): JsxNode => ({
  kind: "map",
  list,
  item,
  body,
});

const pad = (depth: number) => "  ".repeat(depth);

function openTag(
  node: Extract<JsxNode, { kind: "element" }>,
  depth: number,
  selfClosing: boolean,
): string {
  const close = selfClosing ? " />" : ">";
  const inline = [node.name, ...node.attributes].join(" ");
  if (inline.length + depth * 2 <= 90 || node.attributes.length === 0) return `<${inline}${close}`;
  return `<${node.name}\n${node.attributes.map((attribute) => `${pad(depth + 1)}${attribute}`).join("\n")}\n${pad(depth)}${close.trim()}`;
}

/** Prints a node with two-space indentation; short text-only elements stay on one line. */
export function printJsx(node: JsxChild, depth = 0): string {
  if (typeof node === "string") return `${pad(depth)}${node}`;
  if (node.kind === "map") {
    return `${pad(depth)}{${node.list}.map((${node.item}) => (\n${printJsx(node.body, depth + 1)}\n${pad(depth)}))}`;
  }
  if (node.children.length === 0) return `${pad(depth)}${openTag(node, depth, true)}`;
  const onlyText = node.children.every((child) => typeof child === "string");
  const open = openTag(node, depth, false);
  if (onlyText && !open.includes("\n")) {
    const line = `${pad(depth)}${open}${node.children.join("")}</${node.name}>`;
    if (line.length <= 100) return line;
  }
  const inner = node.children.map((child) => printJsx(child, depth + 1)).join("\n");
  return `${pad(depth)}${open}\n${inner}\n${pad(depth)}</${node.name}>`;
}
