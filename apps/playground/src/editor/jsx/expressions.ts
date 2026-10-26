/** JSX expressions for A2UI values: literals, data-model bindings and function calls. */
export interface Scope {
  /** Variable name of the current template item, when inside a ChildList template. */
  readonly item: string | undefined;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** `data.form.email` for "/form/email"; `item.name` for a relative "name" inside a template. */
export function bindingExpression(path: string, scope: Scope): string {
  const absolute = path.startsWith("/");
  const segments = path.split("/").filter((segment) => segment !== "");
  const base = absolute || scope.item === undefined ? "data" : scope.item;
  return segments.reduce(
    (expression, segment) =>
      IDENTIFIER.test(segment)
        ? `${expression}.${segment}`
        : `${expression}[${JSON.stringify(segment)}]`,
    base,
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A JavaScript expression for any A2UI value. */
export function valueExpression(value: unknown, scope: Scope): string {
  if (isRecord(value) && typeof value.path === "string" && Object.keys(value).length === 1)
    return bindingExpression(value.path, scope);
  if (isRecord(value) && typeof value.call === "string") {
    const args = isRecord(value.args) ? valueExpression(value.args, scope) : "";
    return `${value.call}(${args})`;
  }
  if (Array.isArray(value))
    return `[${value.map((item) => valueExpression(item, scope)).join(", ")}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).map(
      ([key, item]) =>
        `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${valueExpression(item, scope)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value);
}

/** A JSX attribute: `name="literal"` for strings, `name={expression}` otherwise. */
export function attribute(name: string, value: unknown, scope: Scope): string {
  if (typeof value === "string") return `${name}=${JSON.stringify(value)}`;
  if (value === true) return name;
  return `${name}={${valueExpression(value, scope)}}`;
}

/** JSX children text: plain text, or `{expression}` for dynamic values. */
export function textChild(value: unknown, scope: Scope): string {
  if (typeof value === "string") return /[{}<>]/.test(value) ? `{${JSON.stringify(value)}}` : value;
  return `{${valueExpression(value, scope)}}`;
}
