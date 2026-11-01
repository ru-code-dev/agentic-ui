import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STYLE_PROP_NAMES } from "@agentic-ui/ui-kit-one-catalog";
import { importBuiltRenderer } from "./built-renderer.ts";
import { renderMappingMarkdown } from "./mapping-markdown.ts";

// Writes MAPPING.md from the build (`tsdown` first: the package `build` and `docs` scripts run both).
const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const dist = await importBuiltRenderer(pkgDir, new URL("../dist/index.mjs", import.meta.url).href);

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
