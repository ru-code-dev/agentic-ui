/**
 * SV-C28: the page's merged surface state (createChatSurfaces, @a2ui/agent RendererState) agrees with
 * the renderer's own processor (createUiKitRuntime, @a2ui/web_core MessageProcessor) over multi-turn
 * chats: after every accepted reply both hold the same surfaces, components and data; a rejected
 * reply changes neither (the page never delivers it). Sequences: create → update → action data →
 * update → delete → re-create, plus a seeded follow-up fuzz over the example compositions.
 */
import type { A2uiMessage } from "@a2ui/web_core/v0_9";
import { createChatSurfaces, surfaceSnapshot } from "@agentic-ui/ui-kit-one-catalog";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { createUiKitRuntime, LocalTransport } from "../src/index.ts";

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
const examples = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../ui-kit-one-catalog/examples/compositions",
);
const compositions = readdirSync(examples)
  .toSorted()
  .map((file) => JSON.parse(readFileSync(join(examples, file), "utf8")) as { messages: object[] });

/** A chat as the page runs it: the referee decides, only accepted replies reach the renderer. */
function chat() {
  const referee = createChatSurfaces();
  const transport = new LocalTransport();
  const runtime = createUiKitRuntime({ transport });
  const errors: string[] = [];
  runtime.onError((error) => errors.push(error.message));
  const rendered = () => {
    const out: Record<string, unknown> = {};
    for (const id of [...runtime.processor.model.surfacesMap.keys()].toSorted()) {
      const surface = runtime.processor.getSurface(id);
      if (surface !== undefined) out[id] = surfaceSnapshot(surface);
    }
    return out;
  };
  return {
    referee,
    errors,
    rendered,
    reply(messages: readonly object[]) {
      const verdict = referee.merge(messages);
      if (verdict.valid) transport.push(messages as readonly A2uiMessage[]);
      return verdict.valid;
    },
  };
}

const v = (message: object) => ({ version: "v0.9", ...message });
const surfaceOf = (messages: readonly object[]) =>
  /"surfaceId":"([^"]+)"/.exec(JSON.stringify(messages))?.[1] ?? "s";

/** Deterministic PRNG (mulberry32), so every fuzz case is reproducible by its seed. */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The example `n` re-targeted at `surfaceId`. */
const example = (n: number, surfaceId: string): object[] => {
  const { messages } = compositions[n % compositions.length]!;
  const from = `"surfaceId":"${surfaceOf(messages)}"`;
  return JSON.parse(JSON.stringify(messages).replaceAll(from, `"surfaceId":"${surfaceId}"`));
};

/** One follow-up turn on `surfaceId`; `kind` picks a valid or a broken shape. */
function followUp(kind: number, surfaceId: string, n: number, existing: string[]): object[] {
  const update = (components: object[]) => v({ updateComponents: { surfaceId, components } });
  // the root re-pointed at a new Flex holding `children` (earlier components stay referable)
  const repoint = (children: string[], extra: object[] = []) =>
    update([
      ...extra,
      { id: `x${n}`, component: "Flex", children },
      { id: "root", component: "Flex", children: [`x${n}`] },
    ]);
  switch (kind) {
    case 0: // a new Text next to components an earlier reply defined (a stateful reference)
      return [
        repoint(
          [`t${n}`, ...existing.slice(0, 2)],
          [{ id: `t${n}`, component: "Text", text: `шаг ${n}` }],
        ),
      ];
    case 1:
      return [v({ updateDataModel: { surfaceId, path: `/fuzz${n}`, value: { n, ok: true } } })];
    case 2: // invalid: update of a surface that was never created
      return [v({ updateDataModel: { surfaceId: `ghost-${n}`, path: "/", value: {} } })];
    case 3: // invalid: a dangling child
      return [repoint([`missing-${n}`])];
    case 4: // invalid: the shown surface created again
      return [v({ createSurface: { surfaceId, catalogId: CATALOG } })];
    case 5: // invalid: a cycle through the root
      return [repoint(["root"])];
    default: // delete and create it again from another example
      return [v({ deleteSurface: { surfaceId } }), ...example(n, surfaceId)];
  }
}

describe("page merged state = renderer state over multi-turn chats [SV-C28]", () => {
  it("create → update → action data → update → delete → re-create", () => {
    const c = chat();
    const first = compositions[0]!.messages;
    const id = surfaceOf(first);
    expect(c.reply(first)).toBe(true);
    expect(c.reply(followUp(0, id, 1, []))).toBe(true);
    expect(
      c.reply([v({ updateDataModel: { surfaceId: id, path: "/", value: { typed: "Анна" } } })]),
    ).toBe(true);
    expect(c.reply(followUp(1, id, 2, []))).toBe(true);
    expect(c.reply(followUp(3, id, 3, []))).toBe(false);
    expect(c.reply([v({ deleteSurface: { surfaceId: id } })])).toBe(true);
    expect(c.reply(followUp(2, id, 4, []))).toBe(false);
    expect(c.reply(first)).toBe(true);
    expect(c.rendered()).toEqual(c.referee.snapshot());
    expect(c.errors).toEqual([]);
  });

  it("seeded follow-up fuzz: 300 chats of 6 turns agree after every turn; rejected turns never reach the renderer", () => {
    let accepted = 0;
    let rejected = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const c = chat();
      const base = compositions[seed % compositions.length]!.messages;
      const id = surfaceOf(base);
      expect(c.reply(base), `seed ${seed}: base`).toBe(true);
      for (let turn = 1; turn <= 6; turn++) {
        const existing = Object.keys(c.referee.snapshot()[id]?.components ?? {}).filter(
          (x) => x !== "root",
        );
        const ok = c.reply(followUp(Math.floor(next() * 7), id, seed * 10 + turn, existing));
        if (ok) accepted++;
        else rejected++;
        expect(c.rendered(), `seed ${seed} turn ${turn}`).toEqual(c.referee.snapshot());
      }
      expect(c.errors, `seed ${seed}`).toEqual([]);
    }
    expect(accepted).toBeGreaterThan(400);
    expect(rejected).toBeGreaterThan(400);
  });
});
