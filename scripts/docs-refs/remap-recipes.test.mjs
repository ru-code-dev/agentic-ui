// A4F (review A4b-R2, R3, R5, R6, A4-D03): the REMAP.md recipe rows the review proved wrong say what the recipe run
// really needs, and the tests the recipes touch stay decoupled from the examples / insertion order.
// Run: node --test scripts/docs-refs/remap-recipes.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const REMAP = read("REMAP.md");

/** The text of `## Recipe <n> — …` up to the next `## ` heading, one line per row (table cells joined). */
function recipe(n) {
  const start = REMAP.indexOf(`## Recipe ${n} `);
  assert.ok(start >= 0, `REMAP.md has recipe ${n}`);
  const end = REMAP.indexOf("\n## ", start + 1);
  return REMAP.slice(start, end < 0 ? undefined : end).replace(/\s+/g, " ");
}

test("[A4b-R2] recipe 3: the facade's Pick row only when the kit component takes the new props; to-jsx's template test has its own fixture", () => {
  assert.match(
    recipe(3),
    /`Pick<AvatarProps, \.\.\.>` list, only when the kit component itself takes the new props; otherwise the facade keeps the kit's props/,
  );
  const toJsx = read("apps/playground/src/editor/jsx/to-jsx.test.ts");
  const start = toJsx.indexOf('it("renders templates as map calls');
  const body = toJsx.slice(start, toJsx.indexOf("\n  it(", start + 1));
  assert.ok(
    start >= 0 && body.includes("createSurface: { surfaceId,"),
    "the template test builds its own messages",
  );
  assert.match(body, /<Avatar name=\{item\.name\}/);
  assert.doesNotMatch(
    body,
    /byId\(|compositions/,
    "no example pins the Avatar output a recipe-3 run changes",
  );
});

test("[A4b-R3] recipes 4 and 8 name every example and conversation/fallback.py that use a dropped value", () => {
  const row =
    /every example and `apps\/agent-server\/src\/agentic_ui_server\/conversation\/fallback\.py` that uses/;
  for (const n of [4, 8]) assert.match(recipe(n), row, `recipe ${n}`);
  assert.match(recipe(4), /`pnpm validate` and the build name them/);
});

test("[A4b-R5] the renderer public-API test compares the barrel with BEFORE_KIT sorted (any insertion place reads clearly)", () => {
  const test = read("packages/ui-kit-one-react/tests/public-api.test.ts");
  assert.match(
    test,
    /expect\(Object\.keys\(kit\)\.toSorted\(\)\)\.toEqual\(BEFORE_KIT\.toSorted\(\)\)/,
  );
});

test("[A4b-R6] recipe 2: MAPPING.md regenerates only for values/fixed/custom mapping changes and names the facade", () => {
  assert.match(
    recipe(2),
    /Regenerates: `packages\/ui-kit-one-react\/MAPPING\.md` only when the `values` \/ `fixed` options or a custom mapping/,
  );
  assert.match(recipe(2), /names the facade, not the package the facade imports/);
});

test("[A4-D03] recipe 7 regenerates the validator cases and handover/README.md; recipe 8 the SERVER-CONTRACT.md", () => {
  const seven = recipe(7);
  for (const file of [
    "apps/agent-server/validator-cases/cases.json",
    "handover/validator-cases/cases.json",
    "handover/README.md",
  ])
    assert.ok(seven.includes(`\`${file}\``), `recipe 7 names ${file}`);
  assert.match(recipe(8), /SERVER-CONTRACT\.md/);
});
