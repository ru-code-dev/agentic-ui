/**
 * DEC-032: what each test proves. A test declares it with a tag `[ID]` or `[ID, ID]` in its title
 * (Vitest / Playwright / node:test: the first string argument of it/test/describe) or in the
 * docstring of a Python test method. Python tests may instead be mapped in
 * apps/agent-server/tests/traceability.json: `{ "tests": { "<path under tests/>::Class.test_x": [IDs] } }`.
 * A tag may hold a range: `[EX-01..24]`. A test id is `<repo path>::<title>` or
 * `<repo path>::Class.test_name`.
 */
export const PY_BASE = "apps/agent-server/tests/";
export const PY_MAP = `${PY_BASE}traceability.json`;
const TAG =
  /\[([A-Z][A-Z0-9]*[a-z]?-[A-Za-z0-9.-]+(?:\s*,\s*[A-Z][A-Z0-9]*[a-z]?-[A-Za-z0-9.-]+)*)\]/g;
const JS_TEST = /\.(?:test|spec)\.(?:ts|tsx|mts|js|mjs)$/;
const PY_TEST = /^apps\/agent-server\/tests\/(?:.+\/)?test_[^/]*\.py$/;
const CALL_BEFORE = /(?:\b(?:it|test|describe|suite)(?:\.\w+)*|\))\s*\(\s*$/;
// A4b-P3: a tag on a skipped / todo / fixme call proves nothing.
const SKIPPED_CALL = /\.(?:skip|todo|fixme)\s*\(\s*$/;
const PY_SKIP = /^\s*@(?:unittest\.)?skip\(/;
const QUOTES = new Set(['"', "'", "`"]);

const RANGE = /^([A-Z][A-Z0-9]*[a-z]?-[A-Z]*)(\d+)\.\.(\d+)$/;

/** `EX-01, PG-02` → both; a range `EX-01..24` → EX-01 … EX-24 (zero padding kept). */
export function splitIds(group) {
  return group.split(",").flatMap((raw) => {
    const id = raw.trim();
    const range = RANGE.exec(id);
    if (!range || Number(range[3]) < Number(range[2])) return [id];
    const width = range[2].length;
    return Array.from(
      { length: Number(range[3]) - Number(range[2]) + 1 },
      (_, i) => `${range[1]}${String(Number(range[2]) + i).padStart(width, "0")}`,
    );
  });
}
const skipped = (path) => /(?:^|\/)(?:fixtures|node_modules)\//.test(path);
export const isJsTest = (path) => JS_TEST.test(path) && !skipped(path);
export const isPyTest = (path) => PY_TEST.test(path) && !skipped(path);

/** End index of the regex literal starting at `i` (its closing `/`). */
function regexEnd(line, i) {
  let inClass = false;
  for (i++; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "[") inClass = true;
    else if (line[i] === "]") inClass = false;
    else if (line[i] === "/" && !inClass) return i;
  }
  return i;
}

/** String literal spans `[start, end]` (quote positions) of one line, up to a `//` comment. */
function literals(line) {
  const spans = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "/" && line[i + 1] === "/") break;
    if (line[i] === "/" && /(?:^|[(,=:[!&|?{};])\s*$/.test(line.slice(0, i))) {
      i = regexEnd(line, i);
      continue;
    }
    if (!QUOTES.has(line[i])) continue;
    const start = i;
    for (i++; i < line.length && line[i] !== line[start]; i++) if (line[i] === "\\") i++;
    spans.push([start, i]);
  }
  return spans;
}

/**
 * The test title that contains position `index` of `line`: `{ title, skipped }`, null when the tag
 * sits in another string literal, undefined when it is outside any string (code such as `/[A-Z0-9]/`).
 */
function titleAt(line, index, previous) {
  const span = literals(line).find(([start, end]) => start < index && index < end);
  if (!span) return undefined;
  const before = line.slice(0, span[0]);
  const call = before.trim() === "" ? (previous ?? "").trimEnd() : before;
  if (!CALL_BEFORE.test(call)) return null;
  return { title: line.slice(span[0] + 1, span[1]), skipped: SKIPPED_CALL.test(call) };
}

/** Tags of a Vitest / Playwright / node:test file. */
export function jsTags(path, text) {
  const tags = [];
  const problems = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const match of line.matchAll(TAG)) {
      const found = titleAt(line, match.index, lines[i - 1]);
      if (found === undefined) continue;
      if (found === null) {
        problems.push(`${path}:${i + 1}: tag [${match[1]}] is not inside a test title`);
        continue;
      }
      if (found.skipped) {
        problems.push(`${path}:${i + 1}: tag [${match[1]}] on a skipped test (A4b-P3)`);
        continue;
      }
      for (const id of splitIds(match[1]))
        tags.push({ id, test: `${path}::${found.title}`, at: `${path}:${i + 1}` });
    }
  });
  return { tags, problems };
}

/** Docstring lines of the method whose `def` is at line `i` (empty when it has none). */
function docstring(lines, i) {
  let j = i;
  while (j < lines.length && !lines[j].trimEnd().endsWith(":")) j++;
  const first = (lines[j + 1] ?? "").trim();
  const quote = ['"""', "'''"].find((q) => first.startsWith(q));
  if (!quote) return /^["']/.test(first) ? [first] : [];
  const doc = [first];
  if (first.length > 3 && first.slice(3).includes(quote)) return doc;
  for (let k = j + 2; k < lines.length; k++) {
    doc.push(lines[k]);
    if (lines[k].includes(quote)) break;
  }
  return doc;
}

/** True when the decorators right above line `i` include an unconditional `@unittest.skip(…)`. */
function skippedAt(lines, i) {
  for (let j = i - 1; j >= 0 && /^\s*@/.test(lines[j]); j--)
    if (PY_SKIP.test(lines[j])) return true;
  return false;
}

/** Test methods (`<path>::Class.test_x`), docstring tags and problems of a Python unittest file. */
export function pyTests(path, text) {
  const tests = [];
  const tags = [];
  const problems = [];
  const lines = text.split("\n");
  let owner = null;
  let ownerSkipped = false;
  lines.forEach((line, i) => {
    const cls = /^class (\w+)/.exec(line);
    if (cls) [owner, ownerSkipped] = [cls[1], skippedAt(lines, i)];
    const def = /^\s+(?:async\s+)?def (test_\w+)/.exec(line);
    if (!def || !owner) return;
    const test = `${path}::${owner}.${def[1]}`;
    tests.push(test);
    const skipped = ownerSkipped || skippedAt(lines, i);
    for (const doc of docstring(lines, i))
      for (const match of doc.matchAll(TAG)) {
        if (skipped)
          problems.push(`${path}:${i + 1}: tag [${match[1]}] on a skipped test (A4b-P3)`);
        else for (const id of splitIds(match[1])) tags.push({ id, test, at: `${path}:${i + 1}` });
      }
  });
  return { tests, tags, problems };
}

/** Tags of the Python mapping file; `defined` = every Python test id found in the repo. */
export function pyMapTags(text, defined) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { tags: [], problems: [`${PY_MAP}: invalid JSON (${error.message})`] };
  }
  const tags = [];
  const problems = [];
  for (const [key, ids] of Object.entries(data.tests ?? {})) {
    const test = `${PY_BASE}${key}`;
    if (!defined.has(test)) problems.push(`${PY_MAP}: test ${key} not found under ${PY_BASE}`);
    else if (!Array.isArray(ids) || ids.length === 0)
      problems.push(`${PY_MAP}: test ${key} must map to a non-empty ID list`);
    else for (const id of ids) tags.push({ id, test, at: `${PY_MAP}: ${key}` });
  }
  return { tags, problems };
}

/** All tags; `read(path)` returns a file's text, `files` = repo-relative paths to scan. */
export function collectTags(read, files) {
  const tags = [];
  const problems = [];
  const defined = new Set();
  for (const path of files) {
    if (isJsTest(path)) {
      const found = jsTags(path, read(path));
      tags.push(...found.tags);
      problems.push(...found.problems);
    } else if (isPyTest(path)) {
      const found = pyTests(path, read(path));
      for (const test of found.tests) defined.add(test);
      tags.push(...found.tags);
      problems.push(...found.problems);
    }
  }
  if (files.includes(PY_MAP)) {
    const mapped = pyMapTags(read(PY_MAP), defined);
    tags.push(...mapped.tags);
    problems.push(...mapped.problems);
  }
  return { tags, problems };
}
