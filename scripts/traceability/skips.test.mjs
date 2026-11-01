/**
 * A4b-P3: a tag proves nothing on a skipped test or in a scripts test file `pnpm check` never runs
 * (in-memory inputs, no repo needed; DEC-068: no run dumps are read).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { unrunScriptTests } from "./run.mjs";
import { jsTags, pyTests } from "./tags.mjs";

const tag = (id) => `[${id}]`; // built at runtime: this file's own titles stay the only tags

test("[A4b-P3] a tag on a .skip / .todo / .fixme call or an @unittest.skip test is a problem", () => {
  const js = [
    `test.skip("${tag("PG-13")} skipped", async () => {});`,
    `it.todo("${tag("PG-13")} todo");`,
    `test.fixme("${tag("PG-13")} fixme", async () => {});`,
    `test.describe.skip("${tag("PG-13")} group", () => {});`,
    `test("${tag("PG-14")} runs", () => {});`,
  ].join("\n");
  const found = jsTags("e2e/x.spec.ts", js);
  assert.deepEqual(
    found.tags.map((t) => t.id),
    ["PG-14"],
  );
  assert.equal(found.problems.length, 4);
  assert.match(found.problems[0], /e2e\/x.spec.ts:1: tag \[PG-13\] on a skipped test \(A4b-P3\)/);
  const py = [
    "class A(unittest.TestCase):",
    '    @unittest.skip("a4b")',
    "    def test_skipped(self):",
    `        """${tag("P5-prompts")} never runs."""`,
    '    @unittest.skipUnless(TIER4, "opt-in")',
    "    def test_tier4(self):",
    `        """${tag("P5-tier4")} conditional: counts."""`,
    '@unittest.skip("whole class")',
    "class B(unittest.TestCase):",
    "    def test_x(self):",
    `        """${tag("P5-b")}"""`,
  ].join("\n");
  const pyFound = pyTests("apps/agent-server/tests/unit/test_a.py", py);
  assert.deepEqual(
    pyFound.tags.map((t) => t.id),
    ["P5-tier4"],
  );
  assert.equal(pyFound.problems.length, 2);
  assert.match(pyFound.problems[1], /test_a.py:10: tag \[P5-b\] on a skipped test/);
});

test("[A4b-P3] a scripts test file that no pnpm check script runs is a problem", () => {
  const packageJson = {
    scripts: {
      check: "vp run -w check:reports && vp run -w test:scripts",
      "check:reports":
        'node --test "scripts/check-report/*.test.mjs" && node scripts/check-report.mjs',
      "test:scripts": "node --test scripts/a.test.mjs scripts/b/c.test.mjs",
      "test:other": "node --test scripts/never.test.mjs",
    },
  };
  const files = [
    "scripts/a.test.mjs",
    "scripts/b/c.test.mjs",
    "scripts/check-report/x.test.mjs",
    "scripts/never.test.mjs",
    "scripts/traceability/fixtures/repo/scripts/f.test.mjs",
  ];
  assert.deepEqual(unrunScriptTests(files, packageJson), [
    "scripts/never.test.mjs: not run by pnpm check (add it to test:scripts) (A4b-P3)",
  ]);
});
