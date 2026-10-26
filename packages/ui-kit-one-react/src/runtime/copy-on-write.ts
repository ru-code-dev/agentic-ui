import type { A2uiMessage, MessageProcessor } from "@a2ui/web_core/v0_9";

type Container = Record<string, unknown> | unknown[];

/** A copy of `container` with `value` written at `segments` (copies every level on the way). */
function setIn(container: unknown, segments: readonly string[], value: unknown): Container {
  const [head, ...rest] = segments as [string, ...string[]];
  const copy: Container = Array.isArray(container)
    ? [...container]
    : { ...(typeof container === "object" && container !== null ? container : {}) };
  const current = (copy as Record<string, unknown>)[head];
  const next = rest.length === 0 ? value : setIn(current, rest, value);
  if (next === undefined && !Array.isArray(copy)) delete copy[head];
  else (copy as Record<string, unknown>)[head] = next;
  return copy;
}

/**
 * web_core applies an `updateDataModel` at a nested path (e.g. `/rows/1`) by mutating the existing
 * containers, so components bound to an ancestor (`/rows`) compare the mutated value with itself
 * and never re-render. Rewriting the update as a copy-on-write of its top-level key gives every
 * level on the path a new identity.
 */
export function toCopyOnWrite(processor: MessageProcessor, message: A2uiMessage): A2uiMessage {
  if (!("updateDataModel" in message)) return message;
  const { surfaceId, path, value } = message.updateDataModel;
  const dataModel = processor.getSurface(surfaceId)?.dataModel;
  const segments = (path ?? "").split("/").filter((segment) => segment !== "");
  if (dataModel === undefined || segments.length < 2) return message;
  const [top, ...rest] = segments as [string, ...string[]];
  return {
    ...message,
    updateDataModel: {
      surfaceId,
      path: `/${top}`,
      value: setIn(dataModel.get(`/${top}`), rest, value),
    },
  };
}
