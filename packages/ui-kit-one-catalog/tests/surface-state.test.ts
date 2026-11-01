import { describe, expect, it } from "vite-plus/test";
import { createChatSurfaces } from "../src/index.ts";

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
const v = (message: object) => ({ version: "v0.9", ...message });
const create = (surfaceId = "s1") => v({ createSurface: { surfaceId, catalogId: CATALOG } });
const components = (list: object[], surfaceId = "s1") =>
  v({ updateComponents: { surfaceId, components: list } });
const data = (value: unknown, path = "/", surfaceId = "s1") =>
  v({ updateDataModel: { surfaceId, path, value } });
const text = (id: string, value = id) => ({ id, component: "Text", text: value });
const flex = (children: string[]) => ({ id: "root", component: "Flex", children });
const first = [create(), components([flex(["a"]), text("a")]), data({ name: "Анна" })];

describe("merged surface state per chat [SV-C28]", () => {
  it("create → update → data → delete → re-create: every step is checked against the merged state", () => {
    const chat = createChatSurfaces();
    expect(chat.merge(first)).toEqual({ valid: true, surfaceIds: ["s1"] });
    // a follow-up may name a component an earlier reply defined: stateless validation cannot know it
    expect(chat.merge([components([flex(["a", "b"]), text("b")])]).valid).toBe(true);
    expect(chat.merge([data("Пётр", "/name")]).valid).toBe(true);
    expect(chat.snapshot().s1).toEqual({
      components: {
        root: { component: "Flex", children: ["a", "b"] },
        a: { component: "Text", text: "a" },
        b: { component: "Text", text: "b" },
      },
      data: { name: "Пётр" },
    });
    expect(chat.merge([v({ deleteSurface: { surfaceId: "s1" } })]).valid).toBe(true);
    expect(chat.surfaceIds()).toEqual([]);
    expect(chat.merge(first).valid).toBe(true);
  });

  it("an update of a surface the chat never created, a re-created surface, a dangling child and a cycle are invalid; nothing changes", () => {
    const chat = createChatSurfaces();
    chat.merge(first);
    const before = chat.snapshot();
    const broken: [string, readonly object[]][] = [
      ["unknown surface", [components([flex(["a"]), text("a")], "other")]],
      ["re-created surface", [create()]],
      ["dangling child", [components([flex(["a", "missing"])])]],
      ["cycle", [components([{ id: "a", component: "Flex", children: ["root"] }])]],
    ];
    for (const [name, messages] of broken) {
      const verdict = chat.merge(messages);
      expect(verdict.valid, name).toBe(false);
      expect(verdict.valid ? "" : verdict.message, name).not.toBe("");
      expect(chat.snapshot(), `${name} left the state unchanged`).toEqual(before);
    }
    expect(chat.merge([components([flex(["a", "missing"]), text("x")])])).toMatchObject({
      valid: false,
      message: expect.stringContaining("missing"),
    });
  });

  it("check gives merge's verdict without changing the state; a reply that fails half-way changes nothing", () => {
    const chat = createChatSurfaces();
    expect(chat.check(first)).toEqual({ valid: true, surfaceIds: ["s1"] });
    expect(chat.surfaceIds()).toEqual([]);
    chat.merge(first);
    const half = [components([flex(["a", "c"]), text("c")]), create()];
    expect(chat.merge(half).valid).toBe(false);
    expect(Object.keys(chat.snapshot().s1?.components ?? {})).toEqual(["root", "a"]);
    expect(chat.merge([create("s2"), components([flex([])], "s2")]).valid).toBe(true);
    expect(chat.surfaceIds()).toEqual(["s1", "s2"]);
  });

  it("a reply rejected after it changed a component's type leaves the shown component in place (type change)", () => {
    const chat = createChatSurfaces();
    chat.merge([
      create(),
      components([{ id: "root", component: "Container", children: ["a"] }, text("a")]),
    ]);
    const before = chat.snapshot();
    expect(chat.merge([components([flex(["missing"])])]).valid).toBe(false);
    expect(chat.check([components([flex(["missing"])])]).valid).toBe(false);
    expect(chat.snapshot()).toEqual(before);
    expect(chat.merge([components([flex(["a"])])]).valid).toBe(true);
  });
});

describe("undo of a rejected reply [DEC-064]", () => {
  it("undo drops the last merge: a repair may re-create the surface the rejected reply created", () => {
    const chat = createChatSurfaces();
    chat.merge(first);
    const rejected = [create("s2"), components([text("root")], "s2")];
    expect(chat.merge(rejected).valid).toBe(true);
    expect(chat.check(rejected).valid).toBe(false); // without the undo: a re-created surface
    expect(chat.depth()).toBe(2);
    expect(chat.undo()).toBe(true);
    expect(chat.surfaceIds()).toEqual(["s1"]);
    expect(chat.messages()).toEqual(first);
    expect(chat.merge(rejected).valid).toBe(true);
    expect(chat.undo() && chat.undo()).toBe(true);
    expect(chat.surfaceIds()).toEqual([]);
    expect(chat.undo()).toBe(false);
  });

  it("an undone retype keeps the component the reply retyped (a replay, not RendererState's rollback)", () => {
    const chat = createChatSurfaces();
    chat.merge(first);
    chat.merge([components([{ id: "a", component: "Flex", children: [] }])]);
    chat.undo();
    expect(chat.snapshot().s1?.components.a).toEqual({ component: "Text", text: "a" });
  });
});
