/**
 * Writes the generated server data (server-data.mjs) into apps/agent-server/src/agentic_ui_server/data/ and deletes
 * every other file there, so nothing foreign ships in the pyz.
 * Usage: node apps/agent-server/scripts/sync_data.mjs   (root `pnpm run server:sync-data`; part of root `pnpm build`).
 * Commit the result: `check:generated` (check-generated.mjs) fails while it is stale or holds a foreign file.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, foreignFiles, serverData } from "./server-data.mjs";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const data = serverData();
const dir = join(pkgDir, DATA_DIR);
const pruned = foreignFiles(
  dir,
  Object.keys(data).map((path) => basename(path)),
);
for (const name of pruned) rmSync(join(dir, name), { recursive: true, force: true });
for (const [path, text] of Object.entries(data)) {
  mkdirSync(dirname(join(pkgDir, path)), { recursive: true });
  writeFileSync(join(pkgDir, path), text);
}
console.log(
  `agent-server: synced ${Object.keys(data).length} data files into ${DATA_DIR}/` +
    (pruned.length > 0 ? `, removed ${pruned.join(", ")}` : ""),
);
