import { createChatSurfaces } from "@agentic-ui/ui-kit-one-catalog";

/** What a renderer does after a change: apply `messages` on top, or rebuild from `messages` (undo, new chat). */
export type SurfaceChange =
  | { readonly kind: "apply"; readonly messages: readonly unknown[] }
  | { readonly kind: "reset"; readonly messages: readonly unknown[] };

export type ApplyResult =
  | {
      readonly valid: true;
      /** Surfaces this reply created (`createSurface`). */
      readonly created: readonly string[];
      /** Shown surfaces this reply changed in place (by surfaceId). */
      readonly updated: readonly string[];
    }
  | { readonly valid: false; readonly errors: readonly string[] };

const createdIds = (messages: readonly unknown[]) =>
  messages.flatMap((message) => {
    const id = (message as { createSurface?: { surfaceId?: unknown } } | null)?.createSurface
      ?.surfaceId;
    return typeof id === "string" ? [id] : [];
  });

const update = (surfaceId: string, value: unknown) => [
  { version: "v0.9", updateDataModel: { surfaceId, path: "/", value } },
];

const isObject = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * SV-C28 on the client: a chat's surfaces as the renderer holds them. Every reply is merged into a copy and
 * the WHOLE merged state is checked first (`createChatSurfaces`, the same referee as the playground and the
 * reference server); an invalid reply changes nothing. Renderers follow the accepted messages (`subscribe`).
 */
export function createSurfaceLog() {
  let surfaces = createChatSurfaces();
  let lastReply = -1; // depth() right after the last applied reply (DEC-064: only that one can be undone)
  const listeners = new Set<(change: SurfaceChange) => void>();
  const emit = (change: SurfaceChange) => {
    for (const listener of listeners) listener(change);
  };
  return {
    /** Merge-then-check, then apply: the surfaces the reply created and updated, or why it is invalid. */
    apply(messages: readonly unknown[]): ApplyResult {
      const verdict = surfaces.merge(messages);
      if (!verdict.valid)
        return { valid: false, errors: verdict.message.split("\n").filter(Boolean) };
      lastReply = surfaces.depth();
      const shown = new Set(surfaces.surfaceIds());
      const created = [...new Set(createdIds(messages))].filter((id) => shown.has(id));
      const updated = verdict.surfaceIds.filter((id) => shown.has(id) && !created.includes(id));
      emit({ kind: "apply", messages });
      return { valid: true, created, updated };
    },
    /** DEC-064: drops the last applied reply when nothing was applied since (renderers rebuild). */
    undoReply(): boolean {
      if (lastReply !== surfaces.depth() || !surfaces.undo()) return false;
      lastReply = -1;
      emit({ kind: "reset", messages: surfaces.messages() });
      return true;
    },
    /**
     * The data model an action sends is what the renderer holds (inputs included): the merged state takes it
     * over before the action's reply is checked, as the server does with the sent model (no renderer change).
     */
    adoptData(surfaceId: string, dataModel: unknown): void {
      if (isObject(dataModel)) surfaces.merge(update(surfaceId, dataModel));
    },
    /** A host's own data-model edit, checked like a reply; throws the reason (nothing changes then). */
    editDataModel(surfaceId: string, value: unknown): void {
      if (!isObject(value)) throw new Error("Корень модели данных должен быть JSON-объектом");
      const verdict = surfaces.merge(update(surfaceId, value));
      if (!verdict.valid) throw new Error(verdict.message);
      emit({ kind: "apply", messages: update(surfaceId, value) });
    },
    /** A new chat: no surfaces. */
    clear(): void {
      surfaces = createChatSurfaces();
      lastReply = -1;
      emit({ kind: "reset", messages: [] });
    },
    /** Every accepted message in order (what a new renderer replays). */
    messages: (): readonly unknown[] => surfaces.messages(),
    surfaceIds: (): readonly string[] => surfaces.surfaceIds(),
    subscribe(listener: (change: SurfaceChange) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SurfaceLog = ReturnType<typeof createSurfaceLog>;
