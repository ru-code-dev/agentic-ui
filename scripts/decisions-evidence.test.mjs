// DEC-058: every older decision of docs/DECISIONS.md (DEC-001..DEC-025, S01-*) is in the "DEC-058 evidence addendum"
// exactly once: in force with checkable pointers (verified like report evidence), superseded by an existing
// decision, or in force with a reason why no proof can exist. Run: node --test scripts/decisions-evidence.test.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evidenceProblems } from "./check-report/evidence.mjs";
import { PROJECT_BASE, projectDocsPresent } from "./project-docs.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const HEADING = "## DEC-058 evidence addendum";
const OLDER = /^(DEC-0(?:0[1-9]|1\d|2[0-5])|S01-[DI]\d+) \|/;
const ENTRY = /^([A-Z][A-Z0-9]*-[A-Za-z0-9.-]+) \| (.+)$/;

/** `{ older, entries, ids }`: the older decision IDs, the addendum lines and every decision ID before it. */
function addendumOf(text) {
  const at = text.indexOf(`\n${HEADING}\n`);
  assert.ok(at >= 0, `docs/DECISIONS.md has no "${HEADING}" section`);
  const history = text.slice(0, at).split("\n");
  const older = history.flatMap((line) => OLDER.exec(line)?.[1] ?? []);
  const ids = new Set(history.flatMap((line) => ENTRY.exec(line)?.[1] ?? []));
  const entries = text
    .slice(at + HEADING.length + 1)
    .split("\n")
    .flatMap((line) => {
      const match = ENTRY.exec(line);
      return match ? [{ id: match[1], rest: match[2] }] : [];
    });
  return { older, entries, ids };
}

/** Problems of one addendum entry (empty = fine). */
function entryProblems({ id, rest }, ids, repo = root) {
  const inForce = /^in force \| evidence: (.+)$/.exec(rest);
  if (inForce) return evidenceProblems(inForce[1], repo).map((problem) => `${id}: ${problem}`);
  const superseded = /^superseded by ([A-Z][A-Z0-9]*-[A-Za-z0-9.-]+)$/.exec(rest);
  if (superseded)
    return ids.has(superseded[1]) ? [] : [`${id}: superseded by unknown ${superseded[1]}`];
  if (/^in force \| no proof: \S.{10,}$/.test(rest)) return [];
  return [
    `${id}: "${rest}" is not "in force | evidence: …", "superseded by <ID>" or "in force | no proof: <why>"`,
  ];
}

// Amendment A3: DECISIONS.md is a workflow record under the gitignored WORKFLOW/project/; its `file:docs/…`
// pointers resolve there (evidence.mjs tries both bases). Without the folder (a fresh clone) there is nothing to
// check — the live-file tests skip; the pure-logic test below always runs.
const DECISIONS = join(root, PROJECT_BASE, "docs", "DECISIONS.md");
const present = projectDocsPresent(root) && existsSync(DECISIONS);
const text = present ? readFileSync(DECISIONS, "utf8") : "";

test("[DEC-058] every older decision (DEC-001..025, S01-*) is in the evidence addendum exactly once", (t) => {
  if (!present) return t.skip(`${PROJECT_BASE}/docs/DECISIONS.md absent (fresh clone)`);
  const { older, entries } = addendumOf(text);
  assert.ok(older.length >= 40, `only ${older.length} older decisions found`);
  const listed = entries.map((entry) => entry.id);
  assert.deepEqual(listed.toSorted(), [...new Set(older)].toSorted());
});

test("[DEC-058] every addendum pointer resolves (files, test names, commands) and every status is well-formed", (t) => {
  if (!present) return t.skip(`${PROJECT_BASE}/docs/DECISIONS.md absent (fresh clone)`);
  const { entries, ids } = addendumOf(text);
  assert.deepEqual(
    entries.flatMap((entry) => entryProblems(entry, ids)),
    [],
  );
});

test("[DEC-058] the checker rejects a missing test, a missing file, an unknown successor and a bare status", () => {
  const ids = new Set(["DEC-020"]);
  const problems = [
    {
      id: "DEC-001",
      rest: "in force | evidence: test:scripts/workflow-guard.test.mjs::no such title zz",
    },
    { id: "DEC-002", rest: "in force | evidence: file:docs/nope.md" },
    { id: "DEC-003", rest: "superseded by DEC-999" },
    { id: "DEC-004", rest: "in force" },
    { id: "DEC-005", rest: "superseded by DEC-020" },
    { id: "DEC-006", rest: "in force | no proof: a conduct rule, nothing to check" },
  ].flatMap((entry) => entryProblems(entry, ids));
  assert.equal(problems.length, 4, problems.join("\n"));
  assert.match(problems[0], /^DEC-001: test "no such title zz" not found/);
  assert.match(problems[1], /^DEC-002: file docs\/nope\.md not found/);
  assert.match(problems[2], /^DEC-003: superseded by unknown DEC-999/);
  assert.match(problems[3], /^DEC-004: "in force" is not/);
});
