// DEC-036: the real list of hand-written files a component addition touches, pinned twice: REMAP.md recipe 7 must
// list exactly RECIPE_7, and no other source file may list (nearly) every component by name, which is what a
// hardcoded per-component list looks like (it would need a hand edit for every new component, or silently leave
// the new one out). Measured by adding a pure-data Badge in a scratch copy: the 9 ALWAYS files, `pnpm check` green.
// Run: node --test scripts/component-files.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const CATALOG = "packages/ui-kit-one-catalog";
const REACT = "packages/ui-kit-one-react";

/** Every file a new component needs, with when: always, custom (instead of passthrough), behaviour props. */
const RECIPE_7 = {
  [`${CATALOG}/src/components/<name>.ts`]: "always",
  [`${CATALOG}/src/components/index.ts`]: "always",
  [`${CATALOG}/src/index.ts`]: "always",
  [`${CATALOG}/tests/public-api.test.ts`]: "always",
  [`${CATALOG}/examples/components/<Name>.json`]: "always",
  [`${REACT}/src/kit/<name>.ts`]: "always",
  [`${REACT}/src/kit/index.ts`]: "always",
  [`${REACT}/tests/public-api.test.ts`]: "always",
  [`${REACT}/src/passthrough-components.ts`]: "always",
  [`${REACT}/src/components/<name>.tsx`]: "custom",
  [`${REACT}/src/registry.ts`]: "custom",
  [`${REACT}/tests/behaviour.test.tsx`]: "behaviour",
};
const ALWAYS = Object.keys(RECIPE_7).filter((path) => RECIPE_7[path] === "always");

/**
 * Source files that name (nearly) every component and why that is fine: they are in RECIPE_7 (a deliberate list,
 * e.g. DEC-050's explicit exports), or a new component needs no edit there.
 */
const NAMES_EVERY_COMPONENT = {
  [`${CATALOG}/src/components/index.ts`]: "RECIPE_7",
  [`${CATALOG}/src/index.ts`]: "RECIPE_7",
  [`${CATALOG}/tests/public-api.test.ts`]: "RECIPE_7",
  [`${REACT}/src/kit/index.ts`]: "RECIPE_7",
  [`${REACT}/tests/public-api.test.ts`]: "RECIPE_7",
  [`${REACT}/tests/snippets.test.tsx`]:
    "EXPECTED is optional: a new snippet gets the generic render check",
  [`${CATALOG}/scripts/contracts-markdown.ts`]:
    "prose: the naming-exceptions table, not a component list",
};

/** The contract's component names: one snippet per component (packages/ui-kit-one-catalog/tests proves it). */
const COMPONENTS = readdirSync(join(root, CATALOG, "examples/components"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""));

/** True when `text` names at least 80 % of `names` (as a word or as `<Name>Api`). */
function namesNearlyAll(text, names) {
  const named = names.filter((name) => new RegExp(`\\b${name}(Api)?\\b`).test(text));
  return named.length >= Math.ceil(names.length * 0.8);
}

/** Hand-written source files (tracked or new; generated files are JSON/Markdown; experiments/ is frozen). */
function sourceFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((path) => /\.(ts|tsx|mjs|js|py|sh)$/.test(path) && !path.startsWith("experiments/"))
    .filter((path) => existsSync(join(root, path)));
}

/** Backticked repo paths in the table rows of REMAP.md recipe 7. */
function remapRecipe7Files() {
  const remap = read("REMAP.md");
  const start = remap.indexOf("\n## Recipe 7 — add a component");
  assert.ok(start >= 0, "REMAP.md: no recipe 7");
  const body = remap.slice(start + 1, remap.indexOf("\n## ", start + 1));
  const rows = body.split("\n").filter((line) => line.startsWith("| `"));
  return [
    ...new Set(
      rows.flatMap((row) => [...row.matchAll(/`((?:packages|apps)\/[^`\s]+)`/g)].map((m) => m[1])),
    ),
  ];
}

test("[DEC-036, DEC-045] REMAP.md recipe 7 lists exactly the files a component addition needs, with the measured count", () => {
  assert.deepEqual(
    remapRecipe7Files().toSorted(),
    Object.keys(RECIPE_7).toSorted(),
    "REMAP.md recipe 7 table",
  );
  assert.equal(ALWAYS.length, 9);
  assert.ok(
    read("REMAP.md").includes(`${ALWAYS.length} hand-written files`),
    "REMAP.md states the count",
  );
  for (const path of Object.keys(RECIPE_7).filter((p) => !p.includes("<")))
    assert.ok(existsSync(join(root, path)), path);
});

test("[DEC-036] no other source file lists every component by name (a hardcoded per-component list)", () => {
  const listing = sourceFiles().filter((path) => namesNearlyAll(read(path), COMPONENTS));
  const unexpected = listing.filter((path) => !(path in NAMES_EVERY_COMPONENT));
  assert.deepEqual(
    unexpected,
    [],
    "these files name every component: derive the list from the contract (COMPONENT_APIS, the registry, " +
      "examples/components/) or, when a new component must be added there by hand, add the file to REMAP.md " +
      "recipe 7 and to RECIPE_7 + NAMES_EVERY_COMPONENT in scripts/component-files.test.mjs",
  );
  assert.deepEqual(
    Object.keys(NAMES_EVERY_COMPONENT).filter((path) => !listing.includes(path)),
    [],
    "NAMES_EVERY_COMPONENT lists a file that no longer names every component: drop it",
  );
  for (const [path, why] of Object.entries(NAMES_EVERY_COMPONENT))
    if (why === "RECIPE_7") assert.ok(path in RECIPE_7, `${path} is not in RECIPE_7`);
});

test("[DEC-036] the detector flags a hardcoded list and ignores a few names (self-test)", () => {
  const all = `const COMPONENTS = [${COMPONENTS.map((name) => `"${name}"`).join(", ")}];`;
  assert.ok(namesNearlyAll(all, COMPONENTS));
  assert.ok(
    namesNearlyAll(
      COMPONENTS.slice(1)
        .map((name) => `${name}Api`)
        .join("\n"),
      COMPONENTS,
    ),
  );
  assert.ok(!namesNearlyAll(COMPONENTS.slice(0, 5).join(" "), COMPONENTS));
});
