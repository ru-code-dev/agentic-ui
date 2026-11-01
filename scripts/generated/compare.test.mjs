// DEC-034: check:generated compares a tracked generated file with its staged copy and with the file on disk, and
// says which one is off. Run: node --test scripts/generated/compare.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compareGenerated } from "./compare.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** A throwaway git repo (inside WORKFLOW/tmp, SV-C18) with `pkg/GEN.md` committed as "old". */
function repo() {
  mkdirSync(join(root, "WORKFLOW/tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, "WORKFLOW/tmp/compare-test-"));
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir });
  mkdirSync(join(dir, "pkg"));
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "");
  writeFileSync(join(dir, ".gitignore"), "WORKFLOW/\npkg/dist/\n");
  writeFileSync(join(dir, "pkg/GEN.md"), "old\n");
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "init");
  return { dir, git, pkg: join(dir, "pkg") };
}

test("[DEC-034] a regenerated but unstaged file says 'stage it'; an unstaged hand edit or deletion fails", () => {
  const { dir, git, pkg } = repo();
  const check = (artifacts) => compareGenerated(pkg, artifacts);
  try {
    writeFileSync(join(pkg, "GEN.md"), "new\n");
    const [unstaged] = check({ "GEN.md": "new\n" });
    assert.match(
      unstaged,
      /^GEN\.md: stale: differs from the staged\/committed copy, the file on disk is fresh: stage/,
    );
    assert.match(
      check({ "GEN.md": "newer\n" })[0],
      /run pnpm build, then stage the regenerated file/,
    );
    git("add", "pkg/GEN.md");
    assert.deepEqual(check({ "GEN.md": "new\n" }), [], "staged = fresh");

    writeFileSync(join(pkg, "GEN.md"), "hand edit\n");
    assert.match(check({ "GEN.md": "new\n" })[0], /^GEN\.md: stale: unstaged edit on disk/);
    unlinkSync(join(pkg, "GEN.md"));
    assert.match(check({ "GEN.md": "new\n" })[0], /^GEN\.md: stale: deleted on disk/);

    writeFileSync(join(pkg, "NEW.md"), "fresh\n");
    assert.match(check({ "NEW.md": "fresh\n" })[0], /^NEW\.md: fresh on disk but not staged/);
    mkdirSync(join(pkg, "dist"));
    writeFileSync(join(pkg, "dist/out.json"), "{}\n");
    assert.deepEqual(
      check({ "dist/out.json": "{}\n" }),
      [],
      "an ignored build output is compared on disk only",
    );
    assert.match(check({ "dist/out.json": "[]\n" })[0], /^dist\/out\.json: stale \(fresh copy/);
    assert.match(
      check({ "dist/none.json": "{}\n" })[0],
      /^dist\/none\.json: missing \(run pnpm build\)/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
