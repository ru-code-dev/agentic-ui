import type { LoggedEvent } from "../state/session-store.ts";

export interface TurnPayload {
  readonly label: string;
  readonly json: string;
}

interface Message {
  readonly createSurface?: { surfaceId: string; sendDataModel?: boolean };
  readonly updateDataModel?: { surfaceId: string; path?: string; value: unknown };
  readonly updateComponents?: { surfaceId: string; components: readonly Component[] };
}

interface Component {
  readonly id: string;
  readonly action?: { event?: { name: string; context?: Record<string, unknown> } };
}

interface ActionSource {
  readonly surfaceId: string;
  readonly sourceComponentId: string;
  readonly name: string;
  readonly context: Record<string, unknown>;
}

const firstAction = (messages: readonly Message[]): ActionSource | undefined => {
  for (const message of messages) {
    const update = message.updateComponents;
    for (const component of update?.components ?? []) {
      const event = component.action?.event;
      if (update !== undefined && event !== undefined)
        return {
          surfaceId: update.surfaceId,
          sourceComponentId: component.id,
          name: event.name,
          context: event.context ?? {},
        };
    }
  }
  return undefined;
};

const initialDataModel = (messages: readonly Message[], surfaceId: string) => {
  const model: Record<string, unknown> = {};
  for (const { updateDataModel: update } of messages) {
    if (update?.surfaceId !== surfaceId) continue;
    const key = (update.path ?? "/").split("/").find((segment) => segment !== "");
    if (key === undefined) Object.assign(model, update.value);
    else model[key] = update.value;
  }
  return model;
};

const pointer = (model: unknown, path: string): unknown =>
  path
    .split("/")
    .filter((segment) => segment !== "")
    .reduce<unknown>(
      (value, segment) =>
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      model,
    );

/** Resolves absolute `{ path }` bindings in an action context the way the renderer does. */
const resolveContext = (context: Record<string, unknown>, model: unknown) =>
  Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      const path = (value as { path?: unknown } | null)?.path;
      return [key, typeof path === "string" ? (pointer(model, path) ?? null) : value];
    }),
  );

/**
 * What the client sends the agent on each turn: the action event (A2UI v0.9 client-to-server
 * message) and, for `sendDataModel` surfaces, the data model. Uses the latest real event when the
 * preview fired one, otherwise the first action of the current messages. Empty when neither exists.
 */
export function turnPayloads(
  messages: readonly unknown[],
  latest: LoggedEvent | undefined,
  dataModels: Readonly<Record<string, unknown>>,
  now: string,
): TurnPayload[] {
  const typed = messages as readonly Message[];
  const source = firstAction(typed);
  const surfaceId = latest?.surfaceId ?? source?.surfaceId;
  if (surfaceId === undefined || (latest === undefined && source === undefined)) return [];
  const model = latest?.dataModel ?? dataModels[surfaceId] ?? initialDataModel(typed, surfaceId);
  const action = {
    version: "v0.9",
    action: {
      name: latest?.name ?? source?.name,
      surfaceId,
      sourceComponentId: source?.sourceComponentId ?? "root",
      timestamp: latest?.time ?? now,
      context: latest?.context ?? resolveContext(source?.context ?? {}, model),
    },
  };
  const payloads: TurnPayload[] = [
    { label: "Action event", json: JSON.stringify(action, null, 2) },
  ];
  const sendsDataModel = typed.some(
    ({ createSurface }) => createSurface?.surfaceId === surfaceId && createSurface.sendDataModel,
  );
  if (sendsDataModel)
    payloads.push({
      label: "Data model (sendDataModel)",
      json: JSON.stringify(
        { a2uiClientDataModel: { version: "v0.9", surfaces: { [surfaceId]: model } } },
        null,
        2,
      ),
    });
  return payloads;
}
