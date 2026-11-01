// `node build.mjs`: a production build of the sample with the Vite it installed (no workspace config). The
// build's warnings go to build-warnings.json (PKG-A-O3: the documented consumer notices are pinned by a test).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, createLogger } from "vite";

const logger = createLogger("warn");
const warnings = [];
logger.warn = (message) => warnings.push(message);
logger.warnOnce = (message) => warnings.push(message);

await build({
  root: import.meta.dirname,
  customLogger: logger,
  build: { outDir: "dist", emptyOutDir: true },
});
writeFileSync(join(import.meta.dirname, "build-warnings.json"), JSON.stringify(warnings));
