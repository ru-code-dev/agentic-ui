// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { staleDistCheck, staleWorkspaceDists } from "./stale-dist.ts";

const tmp = fileURLToPath(new URL("../../../WORKFLOW/tmp", import.meta.url));
mkdirSync(tmp, { recursive: true });
const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** An app depending on `@x/lib` (workspace) whose src/dist files have the given ages (s). */
function app(srcAge: number, distAge: number | undefined): string {
  const root = mkdtempSync(join(tmp, "stale-dist-"));
  dirs.push(root);
  const lib = join(root, "lib");
  const file = (path: string, age: number) => {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "x");
    const when = Date.now() / 1000 - age;
    utimesSync(path, when, when);
  };
  file(join(lib, "src", "deep", "index.ts"), srcAge);
  if (distAge !== undefined) file(join(lib, "dist", "index.mjs"), distAge);
  const appDir = join(root, "app");
  mkdirSync(join(appDir, "node_modules", "@x"), { recursive: true });
  symlinkSync(lib, join(appDir, "node_modules", "@x", "lib"));
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify({ dependencies: { "@x/lib": "workspace:*", react: "18.3.1" } }),
  );
  return appDir;
}

/** A plugin hook as a plain function (the Plugin types allow object hooks too). */
const hook = <T>(value: unknown) => value as T;

describe("stale workspace dist check [PG-30]", () => {
  it("passes when every workspace dist is newer than its src", () => {
    expect(staleWorkspaceDists(app(100, 10))).toEqual([]);
  });

  it("names a package whose src changed after its dist, or whose dist is missing", () => {
    expect(staleWorkspaceDists(app(10, 100))).toEqual([
      { name: "@x/lib", reason: "src changed 90 s after dist was built" },
    ]);
    expect(staleWorkspaceDists(app(10, undefined))).toEqual([
      { name: "@x/lib", reason: "dist is missing" },
    ]);
  });

  it("fails vp build and only warns on vp preview", () => {
    const plugin = staleDistCheck(app(10, 100));
    hook<(config: object) => void>(plugin.configResolved)({ command: "build" });
    const errors: string[] = [];
    hook<(this: object) => void>(plugin.buildStart).call({
      error: (message: string) => errors.push(message),
    });
    expect(errors[0]).toMatch(
      /stale workspace build \(PG-30\): @x\/lib: src changed .* Run `pnpm build`/,
    );
    const warnings: string[] = [];
    hook<(server: object) => void>(plugin.configurePreviewServer)({
      config: { logger: { warn: (message: string) => warnings.push(message) } },
    });
    expect(warnings).toHaveLength(1);
  });
});
