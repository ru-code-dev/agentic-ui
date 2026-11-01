/**
 * Stale-artifact check (DEC-034): writes freshly generated artifacts into WORKFLOW/tmp/generated/
 * and compares them with the staged version (git index) of tracked files and with the file on disk,
 * or only with the file on disk for build outputs (dist/, gitignored). Any difference, a missing
 * file, or a fresh generated file git does not track yet fails. So: stage regenerated files before
 * `check:generated` / `pnpm check`; the message says when only the staging is missing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

/** The repo root above `from` (the folder holding pnpm-workspace.yaml). */
export function repoRoot(from: string): string {
  let dir = resolve(from);
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no pnpm-workspace.yaml above ${from}`);
    dir = parent;
  }
  return dir;
}

/** The git index (staged, else committed) text of `file`; undefined when git does not track it. */
function stagedText(file: string): string | undefined {
  try {
    return execFileSync("git", ["show", `:./${basename(file)}`], {
      cwd: dirname(file),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

/** True when git ignores `file` (a build output such as dist/, or anything under WORKFLOW/). */
function ignored(file: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", basename(file)], {
      cwd: dirname(file),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Why `file` is not the fresh `fresh` text, or undefined when it is. A tracked file is compared with its staged copy
 * (what the commit will hold) and with the file on disk; a gitignored build output only with the file on disk.
 */
function staleness(file: string, fresh: string, freshCopy: string): string | undefined {
  const disk = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const staged = stagedText(file);
  if (staged === undefined) {
    if (disk === undefined) return "missing (run pnpm build)";
    if (disk !== fresh) return `stale (fresh copy: ${freshCopy}; run pnpm build)`;
    if (!ignored(file)) return "fresh on disk but not staged: stage the regenerated file (git add)";
    return undefined;
  }
  if (staged !== fresh) {
    if (disk === fresh)
      return "stale: differs from the staged/committed copy, the file on disk is fresh: stage the regenerated file (git add)";
    return `stale: differs from the staged/committed copy (fresh copy: ${freshCopy}): run pnpm build, then stage the regenerated file`;
  }
  if (disk === undefined) return "stale: deleted on disk, unstaged (run pnpm build)";
  if (disk !== fresh)
    return `stale: unstaged edit on disk (fresh copy: ${freshCopy}): run pnpm build, generated files are never edited by hand`;
  return undefined;
}

/** Compares `artifacts` (package-relative path → fresh text) of the package at `pkgDir`. */
export function compareGenerated(pkgDir: string, artifacts: Readonly<Record<string, string>>) {
  const root = repoRoot(pkgDir);
  const tmp = join(root, "WORKFLOW/tmp/generated", relative(root, pkgDir).replaceAll("/", "__"));
  const problems: string[] = [];
  for (const [path, fresh] of Object.entries(artifacts)) {
    const target = join(tmp, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, fresh);
    const problem = staleness(join(pkgDir, path), fresh, relative(root, target));
    if (problem !== undefined) problems.push(`${path}: ${problem}`);
  }
  return problems;
}

/** CLI tail: prints the verdict and sets the exit code. */
export function report(label: string, problems: readonly string[], count: number): void {
  if (problems.length > 0) {
    console.error(
      `${label}: ${problems.length} stale generated artifact(s)\n${problems.join("\n")}`,
    );
    process.exitCode = 1;
  } else console.log(`${label}: ${count} generated artifacts up to date`);
}
