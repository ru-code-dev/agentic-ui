/**
 * DEC-032 traceability gate tests on the fixture repo fixtures/repo (file contents replaced in
 * memory per case; the CLI case runs on a copy under WORKFLOW/tmp, SV-C18). An ID needs ≥1 tagged
 * test or listed check that exists (DEC-068: no run dumps).
 * Run: node --test "scripts/traceability/*.test.mjs"
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { traceability } from "./run.mjs";
import { jsTags, pyTests, splitIds } from "./tags.mjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/repo", import.meta.url));
const files = readdirSync(fixture, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(fixture, join(entry.parentPath, entry.name)));
const read = (path) => readFileSync(join(fixture, path), "utf8");
const run = (overrides = {}) => traceability(fixture, files, overrides);
const tag = (...ids) => `[${ids.join(", ")}]`; // built at runtime: this file's own titles stay the only tags
const IDS = "docs/TRACEABILITY.ids.json";
const withIds = (edit) => {
  const data = JSON.parse(read(IDS));
  edit(data, (id) => data.ids.find((entry) => entry.id === id));
  return { [IDS]: JSON.stringify(data) };
};
const has = (problems, pattern) =>
  assert.ok(
    problems.some((problem) => pattern.test(problem)),
    `no problem matching ${pattern} in:\n${problems.join("\n")}`,
  );
const statuses = (rows) => Object.fromEntries(rows.map((row) => [row.id, row.status]));
const untagged = {
  "apps/playground/e2e/x.spec.ts": 'test("no tags", () => {});\n',
  "packages/a/tests/a.test.ts": 'describe("sidebar", () => {});\n',
};

test("[DEC-032, PR-05] the fixture repo passes: proven, pending, out of scope, checks and covers", () => {
  const result = run();
  assert.deepEqual(result.problems, []);
  assert.equal(result.stale, false);
  assert.deepEqual(statuses(result.rows), {
    "SV-C1": "proven",
    "SV-C2": "pending: P3",
    "PG-01": "proven",
    "PG-02": "out of scope (DEC-040)",
    "PG-03": "proven",
    "INT-01": "proven",
    "P3-extract": "pending: P3",
  });
  const proofs = Object.fromEntries(result.rows.map((row) => [row.id, row.tests]));
  assert.deepEqual(proofs["SV-C1"], [
    "apps/agent-server/tests/unit/test_x.py::XTest.test_docstring",
    "apps/agent-server/tests/unit/test_x.py::XTest.test_mapped",
  ]);
  assert.equal(proofs["PG-01"].length, 2);
});

test("[DEC-032] an in-scope ID of a done phase without a test or check fails", () => {
  const { problems, rows } = run(untagged);
  has(problems, /^PG-01: phase S05 is done but no test or check proves it$/);
  has(problems, /^INT-01: phase S05 is done but covered IDs are not proven: PG-01$/);
  assert.equal(statuses(rows)["PG-01"], "MISSING PROOF");
});

test("[DEC-032] a tag naming an unknown ID fails, in titles, docstrings and the Python mapping", () => {
  const { problems } = run({
    "packages/a/tests/a.test.ts": `describe("sidebar ${tag("PG-01")}", () => {\n  it("x ${tag("PG-99")}", () => {});\n});\n`,
    "apps/agent-server/tests/unit/test_x.py": `class XTest:\n    def test_mapped(self):\n        """Doc ${tag("SV-C9")}."""\n`,
    "apps/agent-server/tests/traceability.json": JSON.stringify({
      tests: {
        "unit/test_x.py::XTest.test_mapped": ["NOPE-1"],
        "unit/test_x.py::XTest.test_gone": ["SV-C1"],
      },
    }),
  });
  has(problems, /^packages\/a\/tests\/a\.test\.ts:2: tag names unknown ID PG-99$/);
  has(problems, /test_x\.py:2: tag names unknown ID SV-C9$/);
  has(
    problems,
    /traceability\.json: unit\/test_x\.py::XTest\.test_mapped: tag names unknown ID NOPE-1$/,
  );
  has(
    problems,
    /test unit\/test_x\.py::XTest\.test_gone not found under apps\/agent-server\/tests\/$/,
  );
});

test("[DEC-032] a tag in a string that is not a test title fails", () => {
  const { problems } = run({
    "packages/a/tests/a.test.ts": `const title = "x ${tag("PG-01")}";\ndescribe(title, () => {});\n`,
  });
  has(problems, /^packages\/a\/tests\/a\.test\.ts:1: tag \[PG-01\] is not inside a test title$/);
});

test("[DEC-032] pending is allowed only while the phase is open; a gap needs an open phase", () => {
  assert.deepEqual(
    run(untagged).problems.filter((p) => p.startsWith("SV-C2")),
    [],
  );
  const done = run({ ...untagged, ...withIds((data) => (data.phases.P3 = "done")) });
  has(done.problems, /^SV-C2: phase P3 is done but no test or check proves it$/);
  const gap = run(withIds((_, id) => (id("PG-01").gap = "shipped without a test")));
  has(gap.problems, /PG-01: "gap" must be a text and its phase must be open$/);
  const moved = run(
    withIds((_, id) => Object.assign(id("PG-01"), { phase: "P3", gap: "no test" })),
  );
  assert.equal(statuses(moved.rows)["PG-01"], "pending: P3 (gap: no test)");
});

test('[DEC-032] a dropped phase is "out", not done, and holds only out-of-scope IDs (DOC-28)', () => {
  const out = run({ ...untagged, ...withIds((data) => (data.phases.P3 = "out")) });
  has(out.problems, /SV-C2: phase P3 is out \(dropped\): its IDs must be out of scope$/);
  const bad = run(withIds((data) => (data.phases.P3 = "gone")));
  has(bad.problems, /phase P3 state "gone" must be "done", "open" or "out"$/);
});

test("[DEC-032] a stale docs/TRACEABILITY.md is reported", () => {
  assert.equal(run({ "docs/TRACEABILITY.md": "# edited by hand\n" }).stale, true);
  assert.equal(run(untagged).stale, true);
});

test("[DEC-032] every INTENT/SPEC ID is classified; out of scope cites an existing DEC", () => {
  const spec = `${read("docs/SPEC.md")}| PG-04 | new feature |\n`;
  has(run({ "docs/SPEC.md": spec }).problems, /SPEC ID PG-04 is not classified \(add it\)$/);
  const removed = read("docs/server/INTENT.md").replace(/^\| SV-C2 .*\n/m, "");
  has(run({ "docs/server/INTENT.md": removed }).problems, /SV-C2 is not an ID of INTENT/);
  const cite = (evidence) => run(withIds((_, id) => (id("PG-02").evidence = evidence))).problems;
  has(cite("owner said so"), /PG-02: out-of-scope evidence must cite a DEC-nnn$/);
  has(cite("DEC-999"), /PG-02: DEC-999 not found in docs\/DECISIONS\.md$/);
});

test("[DEC-032] checks must be root scripts run by pnpm check; phases must exist", () => {
  const problems = run(
    withIds((_, id) => {
      id("PG-03").checks = ["other"];
      id("SV-C1").phase = "P99";
    }),
  ).problems;
  has(problems, /PG-03: check "other" is not a root script run by pnpm check$/);
  has(problems, /SV-C1: phase "P99" is not listed in "phases"$/);
});

test("[DEC-032] tags: lists, ranges, titles on the next line, Python docstrings", () => {
  assert.deepEqual(splitIds("EX-08..10, SV-C1, PR-04b"), [
    "EX-08",
    "EX-09",
    "EX-10",
    "SV-C1",
    "PR-04b",
  ]);
  const js = jsTags(
    "t.test.ts",
    `it.each(CASES)(\n  "%s works ${tag("PG-01")}",\n  () => {},\n);\n`,
  );
  assert.deepEqual(js, {
    tags: [{ id: "PG-01", test: `t.test.ts::%s works ${tag("PG-01")}`, at: "t.test.ts:2" }],
    problems: [],
  });
  const py = pyTests(
    "p.py",
    `class A:\n    async def test_b(\n        self,\n    ):\n        """Multi\n        line ${tag("SV-C1")}\n        """\n`,
  );
  assert.deepEqual(py.tests, ["p.py::A.test_b"]);
  assert.deepEqual(
    py.tags.map((t) => t.id),
    ["SV-C1"],
  );
});

test("[DEC-032] CLI: exit 1 with one line per problem when stale, --write regenerates", () => {
  const tmp = join(repo, "WORKFLOW", "tmp");
  mkdirSync(tmp, { recursive: true });
  const dir = mkdtempSync(join(tmp, "trace-"));
  try {
    cpSync(fixture, dir, { recursive: true });
    rmSync(join(dir, "docs/TRACEABILITY.md"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    const cli = (...args) =>
      spawnSync("node", [join(repo, "scripts/traceability.mjs"), "--root", dir, ...args], {
        encoding: "utf8",
      });
    const stale = cli();
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /^docs\/TRACEABILITY\.md is stale: run pnpm trace and commit it$/m);
    assert.equal(cli("--write").status, 0);
    assert.equal(
      readFileSync(join(dir, "docs/TRACEABILITY.md"), "utf8"),
      read("docs/TRACEABILITY.md"),
    );
    const ok = cli();
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /^traceability ok: 7 IDs: 4 proven, 2 pending, 1 out of scope$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(existsSync(dir), false);
});

test("[A5-05] a tagged test file that no pnpm check runner executes proves nothing and is a problem", () => {
  const colocated = "packages/a/src/x.test.ts"; // the package's Vitest include is tests/**
  const loose = "apps/agent-server/tests/loose/test_y.py"; // no __init__.py: unittest discovery skips it
  const without = traceability(fixture, files, untagged);
  const result = traceability(fixture, [...files, colocated, loose], {
    ...untagged,
    [colocated]: `it("${tag("PG-01")} never runs", () => {\n  throw new Error("x");\n});\n`,
    [loose]: `class Y(unittest.TestCase):\n    def test_y(self):\n        """${tag("PG-01")}"""\n`,
  });
  has(
    result.problems,
    /^packages\/a\/src\/x\.test\.ts: no pnpm check runner executes it.*\(A5-05\)$/,
  );
  has(
    result.problems,
    /^apps\/agent-server\/tests\/loose\/test_y\.py: no pnpm check runner executes it/,
  );
  assert.equal(statuses(result.rows)["PG-01"], statuses(without.rows)["PG-01"]);
  assert.notEqual(statuses(result.rows)["PG-01"], "proven");
});
