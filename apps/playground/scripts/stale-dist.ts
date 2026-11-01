/**
 * PG-30 (DEC-010): dev resolves workspace packages to `src` (their `development` export
 * condition), but `vp build` / `vp preview` use each package's built `dist`. A `dist` older than
 * its `src` silently ships old code (the owner's "validator expects old schema"): the build fails
 * and the preview warns, naming the package and the fix.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite-plus";

export interface StaleDist {
  readonly name: string;
  readonly reason: string;
}

/** Newest modification time (ms) of any file under `dir`; 0 when it has none. */
export function newestMtime(dir: string): number {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
  }
  return newest;
}

/** `workspace:` dependencies of the package in `appDir` whose `dist` is missing or older than `src`. */
export function staleWorkspaceDists(appDir: string): StaleDist[] {
  const manifest = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  return Object.entries(manifest.dependencies ?? {})
    .filter(([, version]) => version.startsWith("workspace:"))
    .flatMap(([name]) => {
      const dir = realpathSync(join(appDir, "node_modules", name));
      const src = newestMtime(join(dir, "src"));
      const dist = newestMtime(join(dir, "dist"));
      if (dist === 0) return [{ name, reason: "dist is missing" }];
      if (dist < src)
        return [
          { name, reason: `src changed ${Math.round((src - dist) / 1000)} s after dist was built` },
        ];
      return [];
    });
}

export const staleMessage = (stale: readonly StaleDist[]) =>
  `stale workspace build (PG-30): ${stale.map((s) => `${s.name}: ${s.reason}`).join("; ")}. ` +
  "Run `pnpm build` (or `vp run -r build`) first.";

/** Fails `vp build` and warns on `vp preview` when a workspace dependency's dist is stale. */
export function staleDistCheck(appDir: string): Plugin {
  let building = false;
  return {
    name: "agentic-ui:stale-dist",
    configResolved(config) {
      building = config.command === "build";
    },
    buildStart() {
      const stale = building ? staleWorkspaceDists(appDir) : [];
      if (stale.length > 0) this.error(staleMessage(stale));
    },
    configurePreviewServer(server) {
      const stale = staleWorkspaceDists(appDir);
      if (stale.length > 0) server.config.logger.warn(staleMessage(stale));
    },
  };
}
