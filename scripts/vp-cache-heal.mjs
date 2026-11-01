/**
 * DOC-11: vite-plus keeps its task cache in a SQLite file at a fixed path,
 * `node_modules/.vite/task-cache/v<N>/cache.db` (not configurable: vite-plus docs/guide/cache.md
 * "The task cache is stored in node_modules/.vite/task-cache"). In the folder shared by macOS and
 * the Linux VM (virtiofs, DEC-011) that file can become unopenable for one side; then every
 * `vp run` (even with --no-cache) stops with "Failed to initialize cache: unable to open database
 * file". The cache is disposable (`vp cache clean` deletes the same folder), so this pre-step of
 * `pnpm check`, `pnpm e2e`, `pnpm build` and `pnpm test` opens every cache.db and deletes the
 * task-cache folder when one does not open. Run with `node --no-warnings` (node:sqlite warns).
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const TASK_CACHE = join("node_modules", ".vite", "task-cache");

/** The reason `file` does not open as a SQLite database, or undefined when it opens. */
export function openProblem(file) {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.prepare("PRAGMA schema_version").get();
    } finally {
      db.close();
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Checks the task cache under `root`; `{ removed, problems }` (problems: `<file>: <reason>`). */
export function healTaskCache(root) {
  const dir = join(root, TASK_CACHE);
  if (!existsSync(dir)) return { removed: false, problems: [] };
  const problems = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dir, entry.name, "cache.db"))
    .filter((file) => existsSync(file))
    .flatMap((file) => {
      const problem = openProblem(file);
      return problem === undefined ? [] : [`${file}: ${problem}`];
    });
  if (problems.length === 0) return { removed: false, problems };
  rmSync(dir, { recursive: true, force: true });
  return { removed: true, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { removed, problems } = healTaskCache(root);
  if (removed)
    console.warn(
      `vp-cache-heal: deleted ${TASK_CACHE} (vite-plus task cache, rebuilt on the next run):\n  ${problems.join("\n  ")}`,
    );
}
