/**
 * DEC-050 lint rules fire on the committed fixtures (scripts/lint-rules/fixtures, excluded from the
 * repo lint): `import * as` → import/no-namespace, `export * from` / `export * as` (index.ts too)
 * → agentic-ui/no-export-star (scripts/oxlint-plugin), both errors; a reasoned disable is honoured
 * and an unused one is reported. The fixtures are linted from a copy under WORKFLOW/tmp (SV-C18).
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = join(root, "WORKFLOW", "tmp");
mkdirSync(tmp, { recursive: true });
const dir = mkdtempSync(join(tmp, "lint-rules-"));
after(() => rmSync(dir, { recursive: true, force: true }));
cpSync(join(root, "scripts", "lint-rules", "fixtures"), dir, { recursive: true });

/** Lints the fixture copies with the repo config, exactly like `pnpm lint` (+ JSON output). */
function lint() {
  const files = readdirSync(dir).map((name) => relative(root, join(dir, name)));
  const args = ["lint", "-c", ".oxlintrc.json", "--report-unused-disable-directives"];
  let out;
  try {
    out = execFileSync(
      join(root, "node_modules", ".bin", "vp"),
      [...args, "--format", "json", ...files],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
  } catch (error) {
    out = error.stdout;
  }
  const byFile = {};
  for (const d of JSON.parse(out).diagnostics) {
    const name = d.filename.split("/").at(-1);
    (byFile[name] ??= []).push(`${d.severity} ${d.code ?? "unused-directive"}`);
  }
  return byFile;
}

const found = lint();

test("`import * as` is an error (import/no-namespace) [DEC-050]", () => {
  assert.deepEqual(found["import-namespace.ts"], ["error import(no-namespace)"]);
});

test("`export * from` is an error, in index.ts barrels too [DEC-050]", () => {
  assert.deepEqual(found["export-star.ts"], ["error agentic-ui(no-export-star)"]);
  assert.deepEqual(found["index.ts"], ["error agentic-ui(no-export-star)"]);
});

test("`export * as` is an error [DEC-050]", () => {
  assert.deepEqual(found["export-star-as.ts"], ["error agentic-ui(no-export-star)"]);
});

test("named imports/re-exports, dynamic import and a reasoned lookup-table disable pass", () => {
  assert.equal(found["allowed.ts"], undefined);
  assert.equal(found["lookup-table.ts"], undefined);
  assert.equal(found["values.ts"], undefined);
});

test("an unused disable directive is reported (fails pnpm lint via --deny-warnings) [DEC-047]", () => {
  assert.deepEqual(found["unused-disable.ts"], ["warning unused-directive"]);
});

test("an expression-bodied effect callback is an error; a block body passes [OWN-01]", () => {
  assert.deepEqual(found["effect-expression.tsx"], [
    "error agentic-ui(effect-block-body)",
    "error agentic-ui(effect-block-body)",
    "error agentic-ui(effect-block-body)",
  ]);
  assert.equal(found["effect-block.tsx"], undefined);
});

test("a direct crypto.randomUUID is an error (non-secure contexts lack it) [A4-13]", () => {
  assert.deepEqual(found["random-uuid.ts"], [
    "error agentic-ui(no-random-uuid)",
    "error agentic-ui(no-random-uuid)",
  ]);
});
