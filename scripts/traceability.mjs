/**
 * DEC-032 traceability gate. Usage:
 *   node scripts/traceability.mjs            check: exit 1 on any problem or a stale docs/TRACEABILITY.md
 *   node scripts/traceability.mjs --write    regenerate docs/TRACEABILITY.md, then check
 *   node scripts/traceability.mjs --sources  print the IDs parsed from INTENT/SPEC as JSON (seed helper)
 * Options: --root <dir> (default: the repo root). Files scanned = git tracked + untracked, not ignored.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { PROJECT_BASE, resolveDoc } from "./project-docs.mjs";
import { traceability } from "./traceability/run.mjs";
import { sourceIds } from "./traceability/sources.mjs";

const args = argv.slice(2);
const rootAt = args.indexOf("--root");
const root =
  rootAt >= 0 ? resolve(args[rootAt + 1]) : fileURLToPath(new URL("..", import.meta.url));

// Amendment A3: the ID list/source docs/matrix are workflow records, read from WORKFLOW/project/ (or a legacy
// docs/ layout, e.g. tool fixtures). When neither carries them — a fresh clone with only the product — there is
// nothing to check; skip cleanly so `pnpm check` stays green.
const IDS = "docs/TRACEABILITY.ids.json";
if (!existsSync(join(root, resolveDoc(root, IDS)))) {
  console.log(
    `traceability: skipped — workflow records live in the gitignored ${PROJECT_BASE}/ (absent here)`,
  );
  exit(0);
}

if (args.includes("--sources")) {
  const read = (path) => readFileSync(join(root, resolveDoc(root, path)), "utf8");
  const ids = sourceIds({ INTENT: read("docs/server/INTENT.md"), SPEC: read("docs/SPEC.md") });
  console.log(JSON.stringify(ids, null, 2));
  exit(0);
}

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
const result = traceability(root, files);
if (args.includes("--write") && result.stale) {
  writeFileSync(join(root, result.matrixPath), result.text);
  result.stale = false;
  console.log(`wrote ${result.matrixPath}`);
}
const problems = [...result.problems];
if (result.stale) problems.push(`${result.matrixPath} is stale: run pnpm trace and commit it`);
for (const problem of problems) console.error(problem);
const count = (prefix) => result.rows.filter((row) => row.status.startsWith(prefix)).length;
const summary = `${result.rows.length} IDs: ${count("proven")} proven, ${count("pending")} pending, ${count("out")} out of scope`;
if (problems.length > 0) {
  console.error(`traceability: ${problems.length} problem(s); ${summary}`);
  exit(1);
}
console.log(`traceability ok: ${summary}`);
