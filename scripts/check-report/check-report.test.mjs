/**
 * DEC-028 checker tests: one good report (fixtures/repo/docs/server/reports/info-T1-fixture.md),
 * one fixture per defect (fixtures/*.md) and targeted edits of the good one, all checked against the
 * static fixture tree fixtures/repo (never the live repo). Run: node --test "scripts/check-report/*.test.mjs"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkReport } from "./rules.mjs";

const root = fileURLToPath(new URL("./fixtures/repo", import.meta.url));
const FILE = "docs/server/reports/info-T1-fixture.md";
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.md`, import.meta.url), "utf8");
const check = (text) => checkReport(text, { file: FILE, root });
const good = readFileSync(`${root}/${FILE}`, "utf8");
const edit = (from, to) => {
  assert.ok(good.includes(from), `fixture lacks ${from}`);
  return good.replace(from, to);
};
const has = (problems, pattern) =>
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `no problem matching ${pattern} in:\n${problems.join("\n")}`,
  );

test("good fixture passes [DEC-028]", () => {
  assert.deepEqual(check(good), []);
});

test("bad fixture: missing section", () => {
  assert.deepEqual(check(fixture("missing-section")), [`${FILE}: missing section "## decisions"`]);
});

test("bad fixture: missing evidence", () => {
  assert.deepEqual(check(fixture("missing-evidence")), [`${FILE}:18: missing "evidence:" field`]);
});

test("commit: and run: pointers are informational text, never looked up [DEC-068]", () => {
  assert.deepEqual(check(fixture("fake-sha")), []);
  assert.deepEqual(check(edit("commit:1234567", "commit:not-a-sha")), []);
  assert.deepEqual(check(edit("runs/T1/unit.log", "runs/T1/never-written.log")), []);
  has(check(edit("commit:1234567", "commit:")), /commit: pointer is empty/);
});

test("bad fixture: missing file", () => {
  assert.deepEqual(check(fixture("missing-file")), [
    `${FILE}:38: file docs/server/no-such-file.md not found`,
  ]);
});

test("bad fixture: prose line", () => {
  assert.deepEqual(check(fixture("prose-line")), [
    `${FILE}:34: free prose line (every line must be a heading or one "- " entry)`,
  ]);
});

test("bad fixture: secret is reported without its value", () => {
  const problems = check(fixture("secret"));
  assert.equal(problems.length, 1);
  has(problems, /:26: possible secret/);
  assert.ok(!problems[0].includes("fixture-not-a-key"));
});

test("file name and title", () => {
  has(checkReport(good, { file: "docs/server/reports/P2-acp.md", root }), /file name must be/);
  const plain = "docs/server/reports/info-T1.md";
  assert.deepEqual(
    checkReport(good.replace("# info-T1-fixture", "# info-T1"), { file: plain, root }),
    [],
  );
  // PKG part A: a part letter as the slug (info-PKG-A.md).
  const part = "docs/server/reports/info-T1-A.md";
  assert.deepEqual(
    checkReport(good.replace("# info-T1-fixture", "# info-T1-A"), { file: part, root }),
    [],
  );
  has(
    check(edit("# info-T1-fixture", "# info-T1-other")),
    /:1: line 1 must be the title "# info-T1-fixture"/,
  );
  has(check(edit("- phase: T1", "- phase: T2")), /meta phase "T2" must be "T1"/);
});

test("section order, duplicates, unknown headings, empty and `- none` rules", () => {
  const swapped = edit("## measurements\n\n- node version", "## measurementz\n\n- node version");
  has(check(swapped), /unknown section "## measurementz"/);
  has(check(swapped), /missing section "## measurements"/);
  const order = good
    .replace("## deviations\n\n- none\n\n", "")
    .replace("## handoff", "## handoff\n- none\n\n## deviations\n- none\n\n## x");
  has(check(order), /section "## deviations" out of order/);
  has(
    check(edit("## deviations\n\n- none", "## deviations")),
    /empty section "## deviations" must contain exactly "- none"/,
  );
  has(
    check(
      edit(
        "## deviations\n\n- none",
        "## deviations\n- none\n- D1 | spec: a | actual: b | evidence: commit:1234567",
      ),
    ),
    /"- none" must be the only entry/,
  );
  has(
    check(edit("## deviations\n\n- none", "## deviations\n- none\n\n## deviations\n- none")),
    /duplicate section "## deviations"/,
  );
  has(check(edit("## deviations", "### deviations")), /unexpected heading/);
  has(check(edit("- none", "  - none")), /free prose line/);
});

test("meta fields", () => {
  has(
    check(edit("- status: done", "- status: finished")),
    /meta status must be "done" or "partial"/,
  );
  has(check(edit("- date: 2026-10-27", "- date: 27.10.2026")), /meta date must be YYYY-MM-DD/);
  has(check(edit("- brief: orchestrator message\n", "")), /meta "brief" missing or empty/);
  has(check(edit("- brief: orchestrator message", "- owner: me")), /meta entry must be one of/);
});

test("evidence pointers are verified [DEC-028]", () => {
  const req = "evidence: file:docs/server/reports/REPORT-FORMAT.md, commit:1234567";
  has(
    check(
      edit(
        req,
        "evidence: test:apps/agent-server/tests/unit/test_hygiene.py::HygieneTest.test_nope",
      ),
    ),
    /test "test_nope" not found in/,
  );
  has(
    check(edit(req, "evidence: test:apps/no/such_test.py::test_x")),
    /test file apps\/no\/such_test.py not found/,
  );
  has(check(edit(req, "evidence: cmd:node --version")), /must be "<command> => <output summary>"/);
  has(check(edit(req, "evidence: url:https://example.com")), /unknown evidence pointer/);
  has(check(edit(req, "evidence: file:../outside.md")), /must be a repo-relative path/);
  has(check(edit(req, "evidence:")), /"evidence:" has no pointer/);
  const multi =
    "evidence: cmd:echo a, b => 2/2 passed, 0 failed, file:docs/server/reports/REPORT-FORMAT.md";
  assert.deepEqual(check(edit(req, multi)), []);
});

test("backtick-quoted pointers and paths survive the markdown formatter", () => {
  const quoted = edit(
    "evidence: file:docs/server/reports/REPORT-FORMAT.md, commit:1234567",
    "evidence: file:`apps/agent-server/tests/__init__.py`, test:`apps/agent-server/tests/unit/test_hygiene.py::HygieneTest.test_no_silent_except`",
  );
  assert.deepEqual(
    check(
      quoted.replace(
        "- docs/server/reports/REPORT-FORMAT.md |",
        "- `apps/agent-server/tests/__init__.py` |",
      ),
    ),
    [],
  );
  has(
    check(
      edit(
        "file:docs/server/reports/REPORT-FORMAT.md,",
        "file:apps/agent-server/tests/**init**.py,",
      ),
    ),
    /tests\/\*\*init\*\*.py not found/,
  );
});

test("per-section entry shapes", () => {
  has(check(edit("- DEC-028 | done |", "- DEC-028 | finished |")), /requirement must be/);
  has(check(edit("choice: one fixture | ", "")), /missing "choice:" field/);
  has(check(edit("severity: minor", "severity: low")), /severity: blocker\|major\|minor/);
  has(
    check(
      edit(
        "- checker | cmd: node scripts/check-report.mjs",
        "- checker | node scripts/check-report.mjs",
      ),
    ),
    /missing "cmd:" field/,
  );
  has(
    check(edit("scripts/gone.mjs | deleted in this phase", "scripts/gone.mjs | helper")),
    /file scripts\/gone.mjs not found/,
  );
  has(
    check(edit("- 1234567 | docs: DEC-028 implementer report format contract", "- 1234567")),
    /"<sha> \| <subject>"/,
  );
});

test("tests entries: cmd, counts and evidence [DEC-068]", () => {
  has(
    check(edit("3/4 passed, 1 skipped, 0 failed", "all passed")),
    /missing "<passed>\/<total> passed/,
  );
  has(
    check(edit("3/4 passed, 1 skipped, 0 failed", "3/5 passed, 1 skipped, 0 failed")),
    /counts do not add up/,
  );
  has(
    check(edit("cmd: cd apps/agent-server/tests && python3 -m unittest | ", "")),
    /missing "cmd: <command>" field/,
  );
  has(
    check(edit(" | evidence: run:docs/server/reports/runs/T1/unit.log", "")),
    /missing "evidence:" field/,
  );
  const log = "evidence: file:docs/server/reports/T1-pnpm-check.log";
  has(
    check(edit("evidence: run:docs/server/reports/runs/T1/unit.log", log)),
    /file docs\/server\/reports\/T1-pnpm-check.log not found/,
  );
  assert.deepEqual(
    check(
      edit(
        "evidence: run:docs/server/reports/runs/T1/unit.log",
        "evidence: file:docs/server/reports/REPORT-FORMAT.md",
      ),
    ),
    [],
  );
});
