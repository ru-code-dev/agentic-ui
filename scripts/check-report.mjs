/**
 * DEC-028 report checker: `node scripts/check-report.mjs [--root <dir>] [<file>...]`.
 * Reports are workflow records under the gitignored WORKFLOW/project/ (Amendment A3; a legacy `docs/` layout is
 * accepted too, e.g. tool fixtures). Without files it checks every `docs/server/reports/info-*.md` there and
 * resolves each report's `file:`/`test:` pointers (which read `docs/…`) against the repo root or that base
 * (evidence.mjs), so historical reports validate unchanged. Prints one `<file>:<line>: <problem>` line per problem
 * on stderr and exits 1 when there is any; rules in scripts/check-report/*.mjs. Skips cleanly when no reports exist.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_BASE, resolveDoc } from "./project-docs.mjs";
import { checkReport } from "./check-report/rules.mjs";

const args = process.argv.slice(2);
const rootAt = args.indexOf("--root");
const repoRoot =
  rootAt >= 0 ? resolve(args[rootAt + 1]) : fileURLToPath(new URL("..", import.meta.url));
const named = rootAt >= 0 ? args.toSpliced(rootAt, 2) : args;

// The reports dir: WORKFLOW/project/docs/server/reports when present, else the legacy docs/… (fixtures). Its base
// (WORKFLOW/project or the root) is where a report's name and its `docs/…` pointers resolve.
const REPORTS = resolveDoc(repoRoot, "docs/server/reports");
const base = REPORTS.startsWith(`${PROJECT_BASE}/`) ? join(repoRoot, PROJECT_BASE) : repoRoot;
const reportsRel = relative(base, join(repoRoot, REPORTS)).split(sep).join("/");

// No reports in either location — a fresh clone with only the product; skip cleanly so `pnpm check` stays green.
if (named.length === 0 && !existsSync(join(repoRoot, REPORTS))) {
  console.log(
    `check-report: skipped — workflow records live in the gitignored ${PROJECT_BASE}/ (absent here)`,
  );
  process.exit(0);
}

const toBaseRelative = (arg) => {
  const abs = resolve(arg);
  const underBase = relative(base, abs);
  return underBase.startsWith("..") ? relative(repoRoot, abs) : underBase;
};
const files =
  named.length > 0
    ? named.map((arg) => toBaseRelative(arg).split(sep).join("/"))
    : readdirSync(join(repoRoot, REPORTS))
        .filter((name) => /^info-.*\.md$/.test(name))
        .toSorted()
        .map((name) => `${reportsRel}/${name}`);

const problems = files.flatMap((file) =>
  existsSync(join(base, file))
    ? checkReport(readFileSync(join(base, file), "utf8"), { file, root: repoRoot })
    : [`${file}: file not found`],
);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`${problems.length} problem(s) in ${files.length} report(s)`);
  process.exit(1);
}
console.log(`${files.length} report(s) pass the DEC-028 format`);
