import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const repo = join(pkg, "../..");
/** A copy of this package with the repo layout the scripts expect, inside WORKFLOW/ (SV-C18). */
const copy = join(repo, "WORKFLOW/tmp/stale-proof", String(process.pid));
const copyPkg = join(copy, "packages/ui-kit-one-catalog");

const node = (script: string) => {
  const run = spawnSync(process.execPath, [join(copyPkg, "scripts", script)], {
    cwd: copyPkg,
    encoding: "utf8",
  });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const rebuild = () => {
  for (const script of ["build-json.ts", "build-prompt.ts", "build-docs.ts"])
    expect(node(script).code, script).toBe(0);
};
const edit = (file: string, from: string, to: string) => {
  const path = join(copyPkg, file);
  const text = readFileSync(path, "utf8");
  expect(text).toContain(from);
  writeFileSync(path, text.replace(from, to));
};

describe("check:generated [DEC-034, DEC-042]", () => {
  it("fails after a token or description edit until the artifacts are rebuilt", () => {
    rmSync(copy, { recursive: true, force: true });
    mkdirSync(copyPkg, { recursive: true });
    for (const part of ["src", "scripts", "examples", "package.json", "CONTRACTS.md"])
      cpSync(join(pkg, part), join(copyPkg, part), { recursive: true });
    cpSync(join(repo, "scripts/generated"), join(copy, "scripts/generated"), { recursive: true });
    cpSync(join(repo, "pnpm-workspace.yaml"), join(copy, "pnpm-workspace.yaml"));
    symlinkSync(join(pkg, "node_modules"), join(copyPkg, "node_modules"), "dir");

    rebuild();
    expect(node("check-generated.ts")).toMatchObject({ code: 0 });

    edit("src/tokens/space.ts", '  "6": "1.5rem",', '  "6": "1.5rem",\n  "7": "1.75rem",');
    const token = node("check-generated.ts");
    expect(token.code).toBe(1);
    for (const path of [
      "dist/catalog.json: stale",
      "dist/system-prompt.md: stale",
      "CONTRACTS.md: stale",
    ])
      expect(token.out).toContain(path);
    rebuild();
    expect(node("check-generated.ts")).toMatchObject({ code: 0 });
    const built = (file: string) => readFileSync(join(copyPkg, file), "utf8");
    const catalog = JSON.parse(built("dist/catalog.json")) as {
      $defs: { StyleProps: { properties: { p: { enum: string[] } } } };
    };
    expect(catalog.$defs.StyleProps.properties.p.enum).toContain("7");
    expect(built("dist/system-prompt.md")).toContain('"7"');
    expect(built("CONTRACTS.md")).toContain("| `7` | 1.75rem |");

    edit("src/components/tag.ts", "A small inline label", "A small label");
    expect(node("check-generated.ts").code).toBe(1);
    rebuild();
    expect(node("check-generated.ts")).toMatchObject({ code: 0 });
    rmSync(copy, { recursive: true, force: true });
  }, 180_000);
});
