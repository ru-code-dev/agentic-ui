import { describe, expect, it } from "vite-plus/test";
import { parseMessages } from "./parse-messages.ts";
import { validateSource } from "./validation.ts";

const create = {
  version: "v0.9",
  createSurface: { surfaceId: "s", catalogId: "urn:agentic-ui:catalog:ui-kit-one:v1" },
};
const update = {
  version: "v0.9",
  updateComponents: {
    surfaceId: "s",
    components: [{ id: "root", component: "Text", text: "Привет" }],
  },
};

describe("parseMessages [PG-04]", () => {
  it.each([
    ["an array", JSON.stringify([create, update]), "array", 2],
    ["JSONL", `${JSON.stringify(create)}\n${JSON.stringify(update)}\n`, "jsonl", 2],
    ["a single message", JSON.stringify(create), "message", 1],
    [
      "an example file",
      JSON.stringify({ name: "X", description: "Y", messages: [create, update] }),
      "example",
      2,
    ],
    ["a messages wrapper", JSON.stringify({ messages: [create] }), "wrapper", 1],
  ])("recognizes %s", (_label, source, format, count) => {
    const result = parseMessages(source);
    expect(result).toMatchObject({ ok: true, format });
    expect(result.ok && result.messages.length).toBe(count);
  });

  it("reports JSON syntax errors with line and column", () => {
    const result = parseMessages('[\n  {"version": "v0.9",\n  "createSurface": }\n]');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({ line: 3, column: 20 });
  });

  it("reports the failing JSONL line", () => {
    const result = parseMessages(`${JSON.stringify(create)}\n{"version": oops}`);
    expect(!result.ok && result.error.line).toBe(2);
  });

  it("rejects JSON that is not A2UI messages", () => {
    expect(parseMessages('{"hello": 1}')).toMatchObject({ ok: false });
  });
});

describe("validateSource [PG-09] (S01-I3)", () => {
  it("maps a prop error to its JSON path and editor line", () => {
    const messages = [
      create,
      {
        ...update,
        updateComponents: {
          surfaceId: "s",
          components: [{ id: "root", component: "Text", text: "a", fontSize: "huge" }],
        },
      },
    ];
    const source = JSON.stringify(messages, null, 2);
    const issue = validateSource(source, messages);
    expect(issue).toMatchObject({ path: "messages[1].updateComponents.components[0].fontSize" });
    expect(source.split("\n")[(issue?.line ?? 0) - 1]).toContain('"fontSize"');
  });

  it("locates unknown component types", () => {
    const messages = [
      create,
      {
        version: "v0.9",
        updateComponents: { surfaceId: "s", components: [{ id: "root", component: "Slider" }] },
      },
    ];
    const source = JSON.stringify(messages, null, 2);
    const issue = validateSource(source, messages);
    expect(issue?.message).toContain("Unknown component type 'Slider'");
    expect(source.split("\n")[(issue?.line ?? 0) - 1]).toContain('"Slider"');
  });

  it("accepts valid messages", () => {
    expect(validateSource("", [create, update])).toBeUndefined();
  });
});
