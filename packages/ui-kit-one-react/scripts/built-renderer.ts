/**
 * MAPPING.md is rendered from the built renderer (Node cannot load the TSX sources), and the built renderer loads
 * the contract from the catalog package's `dist/`, not its `src/`. A catalog `dist/` older than its `src/` would
 * render a wrong MAPPING.md (an old contract) or fail with a bare SyntaxError ("does not provide an export named
 * …"); both scripts stop first with the reason and the fix instead.
 */
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

/** Newest modification time (ms) of any file under `dir`; 0 when it has none. */
function newestMtime(dir: string): number {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true }))
    if (entry.isFile())
      newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
  return newest;
}

/** Why the catalog `dist/` this package resolves cannot be trusted, or undefined when it is current. */
export function staleCatalogDist(pkgDir: string): string | undefined {
  const catalog = realpathSync(join(pkgDir, "node_modules/@agentic-ui/ui-kit-one-catalog"));
  const dist = newestMtime(join(catalog, "dist"));
  if (dist === 0) return "packages/ui-kit-one-catalog/dist is missing";
  const src = newestMtime(join(catalog, "src"));
  if (dist < src) return "packages/ui-kit-one-catalog/src changed after its dist was built";
  return undefined;
}

/** The built renderer at `file` (DOM globals installed first: @a2ui/react defines custom elements on import). */
export async function importBuiltRenderer(
  pkgDir: string,
  file: string,
): Promise<typeof import("../src/index.ts")> {
  const stale = staleCatalogDist(pkgDir);
  if (stale !== undefined)
    throw new Error(
      `${stale}: MAPPING.md would come from an old contract. Run \`pnpm build\` first.`,
    );
  const { window } = new JSDOM();
  Object.assign(globalThis, {
    HTMLElement: window.HTMLElement,
    customElements: window.customElements,
  });
  try {
    return (await import(file)) as typeof import("../src/index.ts");
  } catch (error) {
    throw new Error(
      `cannot load the built renderer ${file} (${String(error)}). A stale build of a workspace package ` +
        "usually causes this: run `pnpm build` first.",
      { cause: error },
    );
  }
}
