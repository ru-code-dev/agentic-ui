import { validateMessages } from "../validation/validate-messages.ts";
import { positionAt, type SourcePosition } from "./source-position.ts";

export interface SchemaIssue extends SourcePosition {
  readonly message: string;
  /** JSON path into the messages, e.g. `messages[2].updateComponents.components[0].fontSize`. */
  readonly path: string;
}

interface ComponentRef {
  readonly messageIndex: number;
  readonly componentIndex: number;
}

function findComponent(
  messages: readonly unknown[],
  match: (component: Record<string, unknown>) => boolean,
): ComponentRef | undefined {
  for (const [messageIndex, message] of messages.entries()) {
    const list = (message as { updateComponents?: { components?: unknown } }).updateComponents
      ?.components;
    if (!Array.isArray(list)) continue;
    const componentIndex = list.findIndex(
      (component) =>
        typeof component === "object" &&
        component !== null &&
        match(component as Record<string, unknown>),
    );
    if (componentIndex >= 0) return { messageIndex, componentIndex };
  }
  return undefined;
}

function componentAt(
  messages: readonly unknown[],
  ref: ComponentRef,
): Record<string, unknown> | undefined {
  const message = messages[ref.messageIndex] as {
    updateComponents: { components: Array<Record<string, unknown>> };
  };
  return message.updateComponents.components[ref.componentIndex];
}

/** Offset of the component with `id` in the source, then of `prop` inside it when given. */
function locate(source: string, id: string | undefined, prop: string | undefined): SourcePosition {
  if (id === undefined) return { line: 1, column: 1 };
  const escaped = id.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idMatch = new RegExp(`"id"\\s*:\\s*"${escaped}"`).exec(source);
  if (idMatch === null) return { line: 1, column: 1 };
  const objectStart = source.lastIndexOf("{", idMatch.index);
  const propIndex = prop === undefined ? -1 : source.indexOf(`"${prop}"`, objectStart);
  return positionAt(source, propIndex >= 0 ? propIndex : idMatch.index);
}

/**
 * Validates messages against the ui-kit-one catalog (@a2ui/agent validatePayload) and maps the
 * error — which names a component id and prop — to a JSON path and an editor line/column.
 */
export function validateSource(
  source: string,
  messages: readonly unknown[],
): SchemaIssue | undefined {
  const result = validateMessages(messages);
  if (result.valid) return undefined;
  const { message } = result;
  const failed = /component '[^']+' \(([^)]+)\): ([\w.]+):/.exec(message);
  const unknown = /Unknown component type '([^']+)'/.exec(message);
  const dangling =
    /Component '([^']+)' references non-existent component '[^']+' in field '(\w+)'/.exec(message);
  const id = failed?.[1] ?? dangling?.[1];
  const prop = failed?.[2]?.split(".")[0] ?? dangling?.[2];
  const ref =
    id !== undefined
      ? findComponent(messages, (component) => component.id === id)
      : unknown === null
        ? undefined
        : findComponent(messages, (component) => component.component === unknown[1]);
  const target = ref === undefined ? undefined : componentAt(messages, ref);
  const componentId = id ?? (typeof target?.id === "string" ? target.id : undefined);
  const path =
    ref === undefined
      ? "messages"
      : `messages[${ref.messageIndex}].updateComponents.components[${ref.componentIndex}]${prop ? `.${prop}` : ""}`;
  return { message, path, ...locate(source, componentId, unknown !== null ? "component" : prop) };
}
