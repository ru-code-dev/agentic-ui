import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { importBuiltRenderer, staleCatalogDist } from "../scripts/built-renderer.ts";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoot = join(pkgDir, "../../WORKFLOW/tmp");

/** A package dir whose catalog dependency has `src/` touched at `srcTime` and `dist/` at `distTime` (s). */
function fakePackage(srcTime: number, distTime?: number) {
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(join(tmpRoot, "built-renderer-"));
  const catalog = join(dir, "catalog");
  for (const [part, time] of [["src", srcTime] as const, ["dist", distTime] as const]) {
    if (time === undefined) continue;
    mkdirSync(join(catalog, part), { recursive: true });
    writeFileSync(join(catalog, part, "index.ts"), "");
    utimesSync(join(catalog, part, "index.ts"), time, time);
  }
  mkdirSync(join(dir, "node_modules/@agentic-ui"), { recursive: true });
  symlinkSync(catalog, join(dir, "node_modules/@agentic-ui/ui-kit-one-catalog"), "dir");
  return dir;
}

describe("MAPPING.md from a stale catalog build [DEC-034]", () => {
  it("names the stale or missing catalog dist and the fix instead of loading it", async () => {
    const dirs = [fakePackage(2000, 1000), fakePackage(1000), fakePackage(1000, 2000)];
    try {
      const [stale, missing, fresh] = dirs.map((dir) => staleCatalogDist(dir));
      expect(stale).toBe("packages/ui-kit-one-catalog/src changed after its dist was built");
      expect(missing).toBe("packages/ui-kit-one-catalog/dist is missing");
      expect(fresh).toBeUndefined();
      await expect(importBuiltRenderer(dirs[0] ?? "", "unused.mjs")).rejects.toThrow(
        /src changed after its dist was built: MAPPING\.md would come from an old contract\. Run `pnpm build` first\./,
      );
      await expect(
        importBuiltRenderer(dirs[2] ?? "", join(dirs[2] ?? "", "nope.mjs")),
      ).rejects.toThrow(/cannot load the built renderer .*nope\.mjs.*run `pnpm build` first/);
    } finally {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    }
  });
});
