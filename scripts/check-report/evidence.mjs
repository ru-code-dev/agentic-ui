/**
 * DEC-028 evidence pointers: `file:<path>` and `test:<path>::<name>` are verified against the
 * repository at `root`; `cmd:<command> => <summary>` must have that shape; `commit:` and `run:` are
 * informational text, never looked up (DEC-068). Also the secret scan.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { PROJECT_BASE } from "../project-docs.mjs";

const KINDS = /^(commit|file|test|cmd|run):/;
// A committed report must never carry an API key: a generic `sk-…` key-like token or an `*_API_KEY=<value>`
// assignment (the value itself is never reported, only the line number).
const SECRETS = [/\bsk-[A-Za-z0-9][\w-]{6,}/, /[A-Z0-9_]*API_KEY=["']?[^\s"'`]/];
const QUALIFIED = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/;

/**
 * Lines (1-based) that look like an API key; the value itself is never reported.
 * @param {string} text
 */
export function secretLines(text) {
  return text
    .split("\n")
    .flatMap((line, i) => (SECRETS.some((re) => re.test(line)) ? [i + 1] : []));
}

/**
 * Splits the evidence value into pointers. Commas only split before a known pointer prefix, so a
 * `cmd:` summary like `=> 3/3 passed, 0 failed` stays one pointer.
 * @param {string} value
 */
export function splitPointers(value) {
  return value
    .split(/,\s*(?=(?:commit|file|test|cmd|run):)/)
    .map((pointer) => pointer.trim())
    .filter(Boolean);
}

/**
 * Strips one pair of surrounding backticks: `` file:`a/__init__.py` `` survives the markdown formatter,
 * which rewrites a bare `__init__` to `**init**`.
 * @param {string} value
 */
export function unquote(value) {
  const match = /^`([^`]+)`$/.exec(value.trim());
  return match ? match[1] : value.trim();
}

/**
 * Absolute path of a repo-relative path, or null when it is absolute or leaves the repo.
 * @param {string} root
 * @param {string} path
 */
export function repoPath(root, path) {
  if (path === "" || isAbsolute(path)) return null;
  const clean = normalize(path);
  return clean === ".." || clean.startsWith("../") ? null : join(root, clean);
}

/**
 * Amendment A3: a report's pointer resolves against the repo root (committed product: scripts, package.json,
 * test files) OR the gitignored WORKFLOW/project/ base (moved workflow docs it cites as `docs/…`). The first
 * location that exists wins; returns its absolute path, or null when neither has it.
 * @param {string} root repo root
 * @param {string} path repo-relative pointer path
 */
function locate(root, path) {
  const direct = repoPath(root, path);
  if (direct && existsSync(direct)) return direct;
  const moved = repoPath(join(root, PROJECT_BASE), path);
  if (moved && existsSync(moved)) return moved;
  return null;
}

/**
 * @param {string} path
 * @param {string} root
 */
export function fileProblem(path, root) {
  if (repoPath(root, path) === null) return `file "${path}" must be a repo-relative path`;
  return locate(root, path) ? null : `file ${path} not found`;
}

/**
 * `<path>::<name>`; for `Class.test_name` only the last segment must occur in the file.
 * @param {string} value
 * @param {string} root
 */
function testProblem(value, root) {
  const split = value.indexOf("::");
  if (split < 0) return `test "${value}" must be <path>::<name>`;
  const path = value.slice(0, split).trim();
  const name = value.slice(split + 2).trim();
  if (!name) return `test ${path}: empty test name`;
  const full = locate(root, path);
  if (!full || !statSync(full).isFile()) return `test file ${path} not found`;
  const needle = QUALIFIED.test(name) ? name.slice(name.lastIndexOf(".") + 1) : name;
  return readFileSync(full, "utf8").includes(needle)
    ? null
    : `test "${needle}" not found in ${path}`;
}

/**
 * @param {string} pointer one evidence pointer
 * @param {string} root repository root
 * @returns {string | null} problem message or null when the pointer is valid
 */
export function pointerProblem(pointer, root) {
  const kind = KINDS.exec(pointer);
  if (!kind) return `unknown evidence pointer "${pointer}" (use commit:, file:, test:, cmd:, run:)`;
  const value = unquote(pointer.slice(kind[0].length));
  switch (kind[1]) {
    case "commit":
    case "run":
      return value ? null : `${kind[1]}: pointer is empty`;
    case "file":
      return fileProblem(value, root);
    case "test":
      return testProblem(value, root);
    default:
      return /^\S.*?\s=>\s*\S/.test(value)
        ? null
        : `cmd "${value}" must be "<command> => <output summary>"`;
  }
}

/**
 * Problems of an `evidence:` value (null value = missing evidence).
 * @param {string | null} value
 * @param {string} root
 */
export function evidenceProblems(value, root) {
  if (value === null) return ['missing "evidence:" field'];
  const pointers = splitPointers(value);
  if (pointers.length === 0) return ['"evidence:" has no pointer'];
  return pointers.map((pointer) => pointerProblem(pointer, root)).filter(Boolean);
}
