/**
 * DEC-032: one traceability run over a repo root: ID list + source docs + test tags → matrix text
 * and problems (including a stale docs/TRACEABILITY.md).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectDoc, resolveDoc } from "../project-docs.mjs";
import { loadIds, pipelineScripts } from "./ids.mjs";
import { buildMatrix, renderMatrix } from "./matrix.mjs";
import { sourceIds } from "./sources.mjs";
import { collectTags, isJsTest, isPyTest, PY_BASE } from "./tags.mjs";

// Amendment A3: the ID list, source docs and the matrix are workflow records under WORKFLOW/project/; the test
// files they map to stay committed (scanned by their repo-relative paths). package.json stays committed.
// The logical doc paths (resolved per root at read time: WORKFLOW/project/<path> if present, else legacy <path>).
const DOCS = {
  ids: "docs/TRACEABILITY.ids.json",
  matrix: "docs/TRACEABILITY.md",
  intent: "docs/server/INTENT.md",
  spec: "docs/SPEC.md",
  decisions: "docs/DECISIONS.md",
};

// Back-compat export (the matrix's canonical moved location) for callers that write it.
export const PATHS = {
  ...DOCS,
  ids: projectDoc(DOCS.ids),
  matrix: projectDoc(DOCS.matrix),
  intent: projectDoc(DOCS.intent),
  spec: projectDoc(DOCS.spec),
  decisions: projectDoc(DOCS.decisions),
  packageJson: "package.json",
};

const glob = (pattern) =>
  new RegExp(`^${pattern.replaceAll(/[.+^$()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}$`);

/** A4b-P3: `scripts/**.test.mjs` files that no `pnpm check` script runs (their tags prove nothing). */
export function unrunScriptTests(files, packageJson) {
  const commands = [...pipelineScripts(packageJson)].map((name) => packageJson.scripts[name]);
  const patterns = commands
    .flatMap((command) => command.split(/\s+/))
    .map((token) => token.replaceAll(/^["']|["']$/g, ""))
    .filter((token) => token.endsWith(".test.mjs"))
    .map(glob);
  return files
    .filter((file) => /^scripts\/.*\.test\.mjs$/.test(file) && !/\/fixtures\//.test(file))
    .filter((file) => !patterns.some((pattern) => pattern.test(file)))
    .map((file) => `${file}: not run by pnpm check (add it to test:scripts) (A4b-P3)`);
}

/**
 * A5-05: where the `pnpm check` runners pick up tests: each package's Vitest `test.include` (`tests/**`; the
 * playground also `src/**` and `scripts/**`), Playwright's `testDir` (`apps/playground/e2e`) and the root
 * `scripts/**.test.mjs` (matched against test:scripts by unrunScriptTests). Python: unittest discovery needs an
 * `__init__.py` in every directory from apps/agent-server/tests/ down to the file.
 */
export const RUNNERS = [
  /^packages\/[^/]+\/tests\/.+\.test\.tsx?$/,
  /^apps\/playground\/src\/.+\.test\.tsx?$/,
  /^apps\/playground\/scripts\/.+\.test\.ts$/,
  /^apps\/playground\/e2e\/.+\.spec\.ts$/,
  /^scripts\/.+\.test\.mjs$/,
];

/** A5-05: test files no runner executes (their tags prove nothing). */
export function unrunTests(files) {
  const present = new Set(files);
  const packaged = (file) => {
    const dirs = file.slice(PY_BASE.length).split("/").slice(0, -1);
    return (
      dirs.every((_, i) =>
        present.has(`${PY_BASE}${dirs.slice(0, i + 1).join("/")}/__init__.py`),
      ) && present.has(`${PY_BASE}__init__.py`)
    );
  };
  return files.filter(
    (file) =>
      (isJsTest(file) && !RUNNERS.some((runner) => runner.test(file))) ||
      (isPyTest(file) && !packaged(file)),
  );
}

/**
 * `{ text, rows, problems, stale, matrixPath }`; `files` = repo-relative paths to scan for tests;
 * `overrides` = `{ path: text }` replaces file contents (tests, keyed by the legacy `docs/…` path).
 * Workflow docs are read from WORKFLOW/project/<path> when present, else the legacy <path> (fixtures).
 */
export function traceability(root, files, overrides = {}) {
  const at = (logical) => {
    const resolved = resolveDoc(root, logical);
    return logical in overrides ? logical : resolved;
  };
  const read = (path) => overrides[path] ?? readFileSync(join(root, path), "utf8");
  const matrixPath = at(DOCS.matrix);
  const sources = sourceIds({ INTENT: read(at(DOCS.intent)), SPEC: read(at(DOCS.spec)) });
  const ids = loadIds(read(at(DOCS.ids)), DOCS.ids, {
    decisionsText: read(at(DOCS.decisions)),
    packageJson: JSON.parse(read("package.json")),
    sources,
  });
  const unrun = unrunTests(files);
  const tags = collectTags(
    read,
    files.filter((file) => !unrun.includes(file)),
  );
  const packageJson = JSON.parse(read("package.json"));
  const matrix = buildMatrix(ids, tags.tags);
  const text = renderMatrix(ids, matrix.rows);
  const problems = [
    ...ids.problems,
    ...tags.problems,
    ...unrunScriptTests(files, packageJson),
    ...unrun.map(
      (file) => `${file}: no pnpm check runner executes it, its tags prove nothing (A5-05)`,
    ),
    ...matrix.problems,
  ];
  const current =
    DOCS.matrix in overrides || existsSync(join(root, matrixPath)) ? read(at(DOCS.matrix)) : null;
  const stale = current !== text;
  return { text, rows: matrix.rows, problems, stale, matrixPath };
}
