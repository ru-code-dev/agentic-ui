/**
 * A5-01 / A5-02 (ported from the A5 review's attack/web/a5-project-rules.test.tsx and a5-render-bindings.test.tsx):
 * the page store runs the reference server's project rules (the catalog's src/project-rules.ts), so a reply from a
 * backend without them is refused on the page instead of rendering "[object Object]", an empty list or a blank
 * surface.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ApplyResult } from "../src/core/index.ts";
import { A2UIKitProvider, A2UISurface, useA2UISurfaces } from "../src/react/index.ts";

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
const v = (m: object) => ({ version: "v0.9", ...m });
const base = (sid: string, components: object[], value: object) => [
  v({ createSurface: { surfaceId: sid, catalogId: CATALOG } }),
  v({ updateComponents: { surfaceId: sid, components } }),
  v({ updateDataModel: { surfaceId: sid, path: "/", value } }),
];
const table = (value: object) =>
  base(
    "s",
    [
      {
        id: "root",
        component: "Table",
        columns: [{ header: "Имя", key: "name" }],
        rows: { path: "/rows" },
      },
    ],
    value,
  );
const tabs = (value: object) =>
  base(
    "s",
    [
      {
        id: "root",
        component: "Tabs",
        tabs: [
          { title: { path: "/obj" }, child: "a" },
          { title: "B", child: "b" },
        ],
      },
      { id: "a", component: "Text", text: "A-panel" },
      { id: "b", component: "Text", text: "B-panel" },
    ],
    value,
  );

const REFUSED: Record<string, unknown[]> = {
  "text bound to an object": base(
    "s",
    [{ id: "root", component: "Text", text: { path: "/obj" } }],
    { obj: { secret: 1 } },
  ),
  "template over an object": base(
    "s",
    [
      { id: "root", component: "Flex", children: { componentId: "row", path: "/obj" } },
      { id: "row", component: "Text", text: { path: "name" } },
    ],
    { obj: { name: "x" } },
  ),
  "blank surfaceId": base("  ", [{ id: "root", component: "Text", text: "blank" }], {}),
  "template path dot": base(
    "s",
    [
      { id: "root", component: "Flex", children: { componentId: "row", path: "." } },
      { id: "row", component: "Text", text: "row" },
    ],
    {},
  ),
  "tab title bound to an object": tabs({ obj: { x: 1 } }),
  "table rows bound to an object": table({ rows: { name: "x" } }),
  "table rows bound to a string": table({ rows: "abc" }),
  "table rows bound to an array of strings": table({ rows: ["a", "b"] }),
};
const ACCEPTED: Record<string, unknown[]> = {
  "tab title bound to a string": tabs({ obj: "A" }),
  "table rows bound to an array of objects": table({ rows: [{ name: "Анна" }] }),
};

function Host({ messages, out }: { messages: unknown[]; out: { r?: ApplyResult } }) {
  const { surfaces, apply } = useA2UISurfaces({});
  out.r ??= apply(messages);
  return (
    <A2UIKitProvider mode="scoped">
      {surfaces.map((s) => (
        <A2UISurface key={s.id} surface={s} />
      ))}
    </A2UIKitProvider>
  );
}

async function shown(messages: unknown[]) {
  const out: { r?: ApplyResult } = {};
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  const view = render(<Host messages={messages} out={out} />);
  await new Promise((r) => setTimeout(r, 100));
  quiet.mockRestore();
  return { result: out.r, text: view.container.textContent ?? "" };
}

describe("[A5-01, A5-02] page store project rules", () => {
  for (const [name, messages] of Object.entries(REFUSED)) {
    it(`${name}: the page refuses a reply the reference server rejects`, async () => {
      const { result, text } = await shown(messages);
      expect(result?.valid).toBe(false);
      expect(text).not.toContain("[object Object]");
    });
  }
  for (const [name, messages] of Object.entries(ACCEPTED)) {
    it(`${name}: a fitting binding is still accepted and rendered`, async () => {
      const { result, text } = await shown(messages);
      expect(result?.valid).toBe(true);
      expect(text).toMatch(/A-panel|Анна/);
    });
  }
});
