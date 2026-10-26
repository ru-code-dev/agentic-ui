import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN = /^(react|react-dom|@chakra-ui\/.*|@emotion\/.*|framer-motion)$/;

interface Manifest {
  readonly name: string;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
}

/** Resolves a package's directory from `fromDir` the way Node does (node_modules walk). */
function packageDir(name: string, fromDir: string): string | undefined {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    try {
      readManifest(candidate);
      return candidate;
    } catch {
      if (dirname(dir) === dir) return undefined;
    }
  }
}

/** Every package reachable through production dependencies (peers included). */
function productionClosure(rootDir: string): Set<string> {
  const seen = new Set<string>();
  const queue = [rootDir];
  for (let dir = queue.pop(); dir !== undefined; dir = queue.pop()) {
    const manifest = readManifest(dir);
    const names = Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    });
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const resolved = packageDir(name, dir);
      if (resolved !== undefined) queue.push(resolved);
    }
  }
  return seen;
}

describe("contract boundary", () => {
  it("has no React, Chakra, Emotion or framer-motion in its production dependency closure", () => {
    const closure = productionClosure(packageRoot);
    expect(closure.has("@a2ui/web_core")).toBe(true);
    expect([...closure].filter((name) => FORBIDDEN.test(name))).toEqual([]);
  });

  it("never imports a UI library from its sources", () => {
    const sources = readdirSync(join(packageRoot, "src"), {
      recursive: true,
      encoding: "utf8",
    }).filter((file) => file.endsWith(".ts"));
    const importsUi =
      /from\s+["'](react|react-dom|@chakra-ui\/[^"']+|@emotion\/[^"']+|framer-motion)["']/;
    expect(
      sources.filter((file) =>
        importsUi.test(readFileSync(join(packageRoot, "src", file), "utf8")),
      ),
    ).toEqual([]);
  });

  it("resolves a single zod instance shared with @a2ui/web_core", () => {
    const own = createRequire(join(packageRoot, "package.json")).resolve("zod");
    const webCore = packageDir("@a2ui/web_core", packageRoot);
    expect(webCore).toBeDefined();
    expect(createRequire(join(webCore as string, "package.json")).resolve("zod")).toBe(own);
  });
});
