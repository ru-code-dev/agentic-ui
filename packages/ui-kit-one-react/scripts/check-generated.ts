import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { STYLE_PROP_NAMES } from "@agentic-ui/ui-kit-one-catalog";
import { compareGenerated, repoRoot, report } from "../../../scripts/generated/compare.ts";
import { importBuiltRenderer } from "./built-renderer.ts";
import { renderMappingMarkdown } from "./mapping-markdown.ts";

// MAPPING.md comes from the built mappings (Node cannot load TSX): build a fresh copy into
// WORKFLOW/tmp, resolve its imports through this package's node_modules, render, compare.
const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const tmp = join(repoRoot(pkgDir), "WORKFLOW/tmp/generated/ui-kit-one-react-build");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
symlinkSync(join(pkgDir, "node_modules"), join(tmp, "node_modules"), "dir");
execFileSync(
  join(pkgDir, "node_modules/.bin/tsdown"),
  ["--out-dir", join(tmp, "dist"), "--no-dts"],
  {
    cwd: pkgDir,
    stdio: "ignore",
  },
);

const built = await importBuiltRenderer(pkgDir, join(tmp, "dist/index.mjs"));
const artifacts = {
  "MAPPING.md": renderMappingMarkdown(
    built.COMPONENT_MAPPINGS,
    Object.keys(built.PASSTHROUGH),
    built.ICON_KIT_NAMES,
    STYLE_PROP_NAMES,
  ),
};
report("ui-kit-one-react", compareGenerated(pkgDir, artifacts), Object.keys(artifacts).length);
