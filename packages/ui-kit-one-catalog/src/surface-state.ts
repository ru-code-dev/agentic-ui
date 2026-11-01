/**
 * SV-C28 (DEC-061): a chat's surfaces as the renderer holds them, and the merge-then-check of every
 * reply. One `RendererState` of @a2ui/agent per chat runs each message through web_core's
 * `MessageProcessor` (the renderer's own processor), so a reply is checked against everything the
 * earlier replies left: an update of a surface that was never created, a re-created surface, a
 * dangling child, a missing root, a cycle are invalid. `merge` keeps the copy of a valid reply and
 * the state as it was otherwise; `check` never changes it. Every reply also passes the project rules
 * (project-rules.ts: bound value types, template lists, blank surfaceId, A5-01). The same referee as the
 * reference server's Python port (apps/agent-server validation/surfaces.py); reused by the PKG package.
 */
import { RendererState } from "@a2ui/agent";
import { uiKitOneContract } from "./catalog.ts";
import { projectRules, type ProjectRules } from "./project-rules.ts";

export type MergeVerdict =
  | { readonly valid: true; readonly surfaceIds: readonly string[] }
  | { readonly valid: false; readonly message: string };

/** A surface as plain JSON: components by id (`component` = its type, then its props) and data. */
export interface SurfaceSnapshot {
  readonly components: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly data: unknown;
}

/** What `surfaceSnapshot` reads: a web_core surface (RendererState's or a renderer's). */
export interface SurfaceLike {
  readonly componentsModel: {
    readonly entries: Iterable<
      readonly [string, { readonly type: string; readonly properties: object }]
    >;
  };
  readonly dataModel: { get(path: string): unknown };
}

const plain = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/** The JSON view of a surface, comparable across processors. */
export function surfaceSnapshot(surface: SurfaceLike): SurfaceSnapshot {
  const components: Record<string, Record<string, unknown>> = {};
  for (const [id, model] of surface.componentsModel.entries)
    components[id] = plain({ ...model.properties, component: model.type }) as Record<
      string,
      unknown
    >;
  return { components, data: plain(surface.dataModel.get("/")) };
}

let sharedRules: ProjectRules | undefined;
const rules = () => (sharedRules ??= projectRules());

const messageOf = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

/**
 * The surfaces of one chat (create a new one per chat). Every reply is merged into a copy: a fresh
 * RendererState that replays the accepted messages. Not RendererState's own rollback: in
 * @a2ui/agent 0.0.2 a transaction whose update changed a component's type and whose tree check then
 * failed rolls back without that component (tests/surface-state.test.ts "type change").
 * `undo` (DEC-064) drops the last merge the same way: the state is the replay of the merges before it.
 */
export function createChatSurfaces() {
  const merges: (readonly unknown[])[] = [];
  const replayed = () => {
    const copy = new RendererState([uiKitOneContract]);
    copy.apply(merges.flat());
    return copy;
  };
  let state = new RendererState([uiKitOneContract]);
  const attempt = (messages: readonly unknown[]) => {
    const copy = replayed();
    copy.markChecked(copy.surfaceIds); // earlier replies were checked when they were accepted
    rules().checkMessages(messages);
    const surfaceIds = copy.apply(messages);
    copy.checkTopology(surfaceIds);
    for (const id of new Set(surfaceIds)) {
      const surface = copy.getSurface(id);
      if (surface !== undefined) rules().checkSurface(surface);
    }
    return { copy, surfaceIds };
  };
  const run = (messages: readonly unknown[], keep: boolean): MergeVerdict => {
    try {
      const { copy, surfaceIds } = attempt(messages);
      if (keep) {
        state = copy;
        merges.push([...messages]);
      }
      return { valid: true, surfaceIds };
    } catch (failure) {
      return { valid: false, message: messageOf(failure) };
    }
  };
  return {
    /** Merges `messages` into the surfaces when the merged state is valid; else nothing changes. */
    merge: (messages: readonly unknown[]): MergeVerdict => run(messages, true),
    /** The verdict `merge` would give, without changing anything. */
    check: (messages: readonly unknown[]): MergeVerdict => run(messages, false),
    /** How many merges the surfaces hold (`undo` drops the last one). */
    depth: (): number => merges.length,
    /** DEC-064: drops the last merge (a reply the page rejected after showing it); false when there is none. */
    undo(): boolean {
      if (merges.pop() === undefined) return false;
      state = replayed();
      return true;
    },
    /** Every accepted message in order (what a clean renderer replays to show the surfaces). */
    messages: (): readonly unknown[] => merges.flat(),
    /** The surface ids the chat shows. */
    surfaceIds: (): readonly string[] => state.surfaceIds.toSorted(),
    /** Every surface as JSON (agreement tests, PKG). */
    snapshot(): Readonly<Record<string, SurfaceSnapshot>> {
      const out: Record<string, SurfaceSnapshot> = {};
      for (const id of state.surfaceIds.toSorted()) {
        const surface = state.getSurface(id);
        if (surface !== undefined) out[id] = surfaceSnapshot(surface);
      }
      return out;
    },
  };
}

export type ChatSurfaces = ReturnType<typeof createChatSurfaces>;
