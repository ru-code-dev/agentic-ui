/**
 * Amendment A3: workflow records (DECISIONS, HANDOFF, SPEC, INTENT, PLAN, RESEARCH, EXPERIMENT, reports,
 * TRACEABILITY, screenshots/spike, experiments/llm-contract) are NOT committed product; they live in the
 * gitignored `WORKFLOW/project/` of a working copy, at the same relative path (e.g. `docs/DECISIONS.md` →
 * `WORKFLOW/project/docs/DECISIONS.md`). Workflow tools read them from there and SKIP cleanly when the folder
 * is absent (a fresh clone that carries only the product). This module is the one place that knows the base.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const PROJECT_BASE = "WORKFLOW/project";

/** True when this working copy carries the workflow records under WORKFLOW/project/. */
export function projectDocsPresent(root) {
  return existsSync(join(root, PROJECT_BASE));
}

/** Repo-relative location of a moved workflow doc: `WORKFLOW/project/<path>`. */
export function projectDoc(path) {
  return `${PROJECT_BASE}/${path}`;
}

/**
 * Repo-relative location of a workflow doc for READING: the moved `WORKFLOW/project/<path>` when it exists,
 * else the legacy `<path>` (lets tool tests keep plain-layout fixtures, which cannot live under the gitignored
 * WORKFLOW/). `root` is the repo/fixture root the caller resolves against.
 */
export function resolveDoc(root, path) {
  const moved = projectDoc(path);
  return existsSync(join(root, moved)) ? moved : path;
}

/** Print one clear skip line and return true when the records are absent (so a tool can exit 0). */
export function skipWithoutProjectDocs(root, tool) {
  if (projectDocsPresent(root)) return false;
  console.log(
    `${tool}: skipped — workflow records live in the gitignored ${PROJECT_BASE}/ (absent here)`,
  );
  return true;
}
