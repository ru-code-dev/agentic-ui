/**
 * DEC-047: the committed `.githooks/pre-commit` formats what a commit contains. Each case runs in a
 * fresh shallow clone under WORKFLOW/tmp (SV-C18) that uses this working tree's hook and oxfmt
 * config, commits a badly formatted file and reads the committed blob back.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = join(root, "WORKFLOW", "tmp");
mkdirSync(tmp, { recursive: true });
const clones = [];
after(() => clones.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const BAD = "export const  a = {b:1}\n";
const GOOD = "export const a = { b: 1 };\n";
const AUTHOR = ["-c", "user.name=n8tb1t", "-c", "user.email=n8tb1t@gmail.com"];

function clone() {
  const dir = mkdtempSync(join(tmp, "pre-commit-"));
  clones.push(dir);
  execFileSync("git", ["clone", "-q", "--depth", "1", `file://${root}`, dir]);
  for (const file of [
    ".githooks/pre-commit",
    ".githooks/post-commit",
    ".oxfmtrc.json",
    "apps/agent-server/ruff.toml",
  ]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    copyFileSync(join(root, file), join(dir, file));
  }
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("config", "core.hooksPath", ".githooks");
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const read = (file) => readFileSync(join(dir, file), "utf8");
  return { dir, git, write, read, commit: (...args) => git(...AUTHOR, "commit", "-q", ...args) };
}

const platform = `${process.platform === "darwin" ? "darwin" : "linux"}-${execFileSync("uname", ["-m"], { encoding: "utf8" }).trim()}`;
const RUFF = join(root, "WORKFLOW", "tools", platform, "bin", "ruff");

test("git commit: the committed blob is formatted, the tree is clean", () => {
  const repo = clone();
  repo.write("src/bad.ts", BAD);
  repo.git("add", "src/bad.ts");
  repo.commit("-m", "bad");
  assert.equal(repo.git("show", "HEAD:src/bad.ts"), GOOD);
  assert.equal(repo.read("src/bad.ts"), GOOD);
  assert.equal(repo.git("status", "--porcelain", "--", "src"), "");
});

test("git -c user.name=… commit <pathspecs>: formatted blob, index and tree in sync", () => {
  const repo = clone();
  repo.write("src/bad.ts", BAD);
  repo.git("add", "--intent-to-add", "src/bad.ts");
  repo.write("src/other.ts", BAD);
  repo.commit("-m", "pathspec", "--", "src/bad.ts");
  assert.equal(repo.git("show", "HEAD:src/bad.ts"), GOOD);
  assert.equal(repo.git("show", "HEAD:src/bad.ts"), repo.git("show", ":src/bad.ts"));
  assert.equal(repo.git("status", "--porcelain", "--", "src/bad.ts"), "");
  assert.equal(repo.read("src/other.ts"), BAD, "files outside the pathspec are untouched");
});

test("a partially staged file is not formatted, so unstaged hunks stay out of the commit", () => {
  const repo = clone();
  repo.write("src/part.ts", BAD);
  repo.git("add", "src/part.ts");
  repo.write("src/part.ts", `${BAD}export const  unstaged = 1\n`);
  repo.commit("-m", "partial");
  assert.equal(repo.git("show", "HEAD:src/part.ts"), BAD);
  assert.equal(repo.read("src/part.ts"), `${BAD}export const  unstaged = 1\n`);
});

test("ignored and unsupported files are committed unchanged", () => {
  const repo = clone();
  repo.write("docs/server/raw.md", "#  raw\n*  x\n");
  repo.write("tool.py", "x  =  1\n");
  repo.git("add", "docs/server/raw.md", "tool.py");
  repo.commit("-m", "ignored");
  assert.equal(repo.git("show", "HEAD:docs/server/raw.md"), "#  raw\n*  x\n");
  assert.equal(repo.git("show", "HEAD:tool.py"), "x  =  1\n");
});

test("a file oxfmt cannot parse does not block the commit", () => {
  const repo = clone();
  repo.write("src/broken.ts", "export const = ;\n");
  repo.write("src/bad.ts", BAD);
  repo.git("add", "src/broken.ts", "src/bad.ts");
  repo.commit("-m", "broken");
  assert.equal(repo.git("show", "HEAD:src/broken.ts"), "export const = ;\n");
  assert.equal(repo.git("log", "-1", "--format=%s").trim(), "broken");
});

test(
  "a staged .py file is committed as ruff formats it (DEC-047, apps/agent-server/ruff.toml)",
  {
    skip: existsSync(RUFF) ? false : `${RUFF} missing (bash scripts/setup-workflow.sh)`,
  },
  () => {
    const repo = clone();
    const file = "apps/agent-server/src/bad.py";
    repo.write(file, "x  =  {'a':1}\n");
    repo.git("add", file);
    execFileSync("git", [...AUTHOR, "commit", "-q", "-m", "py"], {
      cwd: repo.dir,
      env: { ...process.env, AGENTIC_UI_RUFF: RUFF },
    });
    assert.equal(repo.git("show", `HEAD:${file}`), 'x = {"a": 1}\n');
    assert.equal(repo.git("status", "--porcelain", "--", file), "");
  },
);

test("a commit that stages a tagged test regenerates the matrix locally and never stages the gitignored copy (TOOL-I2/I6)", () => {
  const repo = clone();
  const file = "apps/agent-server/tests/unit/test_hook_tag.py";
  // Amendment A3: the matrix lives in the gitignored WORKFLOW/project/, so a clone (product only) carries none.
  assert.throws(() => repo.git("show", "HEAD:docs/TRACEABILITY.md"), /does not exist/);
  const tag = ["[", "SV-C1", "]"].join(""); // built, so this file holds no tag outside a test title
  repo.write(
    file,
    `class HookTagTest:\n    def test_tag(self) -> None:\n        """${tag} tag added by a commit."""\n`,
  );
  repo.write("src/other.ts", BAD);
  repo.git("add", file);
  repo.commit("-m", "tagged test", "--", file);
  // The hook runs traceability.mjs --write (which skips: no WORKFLOW/project/ in a clone) and stages nothing extra:
  // the matrix is gitignored now, so the commit holds only the test file.
  assert.equal(repo.git("diff", "--name-only", "HEAD~1", "HEAD"), `${file}\n`);
  assert.doesNotMatch(repo.git("status", "--porcelain"), /TRACEABILITY\.md/, "no stray matrix");
  assert.throws(
    () => repo.git("show", "HEAD:docs/TRACEABILITY.md"),
    /does not exist/,
    "not committed",
  );
  const trace = spawnSync("node", ["scripts/traceability.mjs"], {
    cwd: repo.dir,
    encoding: "utf8",
  });
  assert.equal(trace.error, undefined);
  assert.match(trace.stdout + trace.stderr, /traceability: skipped/);
});

test("a commit without tests or ID inputs leaves the traceability matrix alone", () => {
  const repo = clone();
  repo.write("src/bad.ts", BAD);
  repo.git("add", "src/bad.ts");
  repo.commit("-m", "no tests");
  assert.equal(repo.git("diff", "--name-only", "HEAD~1", "HEAD"), "src/bad.ts\n");
});
