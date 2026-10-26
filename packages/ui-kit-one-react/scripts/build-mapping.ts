import { writeFileSync } from "node:fs";
import { STYLE_PROP_NAMES } from "@agentic-ui/ui-kit-one-catalog";
import { JSDOM } from "jsdom";
import { renderMappingMarkdown } from "./mapping-markdown.ts";

// Node cannot load the TSX sources, so the mappings are read from the build (run `tsdown` first).
// @a2ui/react defines custom elements at import time, which needs DOM globals.
const { window } = new JSDOM();
Object.assign(globalThis, {
  HTMLElement: window.HTMLElement,
  customElements: window.customElements,
});
const dist = (await import(
  new URL("../dist/index.mjs", import.meta.url).href
)) as typeof import("../src/index.ts");

writeFileSync(
  new URL("../MAPPING.md", import.meta.url),
  renderMappingMarkdown(
    dist.COMPONENT_MAPPINGS,
    Object.keys(dist.PASSTHROUGH),
    dist.ICON_KIT_NAMES,
    STYLE_PROP_NAMES,
  ),
);
console.log("wrote MAPPING.md");
