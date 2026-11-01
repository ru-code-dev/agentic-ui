// SV-C18: scripts/project-local.sh fails a command that writes outside the project. Run: node --test scripts/project-local.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const wrapper = join(root, "scripts/project-local.sh");

/** Runs `sh -c script` through the wrapper with a fake system temp dir (so the test never writes to /tmp). */
function wrapped(script) {
  mkdirSync(join(root, "WORKFLOW/tmp"), { recursive: true });
  const fakeTmp = mkdtempSync(join(root, "WORKFLOW/tmp/fake-system-tmp-"));
  try {
    const result = spawnSync("bash", [wrapper, "sh", "-c", script], {
      encoding: "utf8",
      env: { ...process.env, PROJECT_LOCAL_TMP_ROOT: fakeTmp, FAKE_TMP: fakeTmp },
    });
    return { ...result, fakeTmp: readdirSync(fakeTmp) };
  } finally {
    rmSync(fakeTmp, { recursive: true, force: true });
  }
}

test("[SV-C18] a command that writes only inside the project passes, with HOME/XDG on the sentinel and TMPDIR in WORKFLOW", () => {
  const result = wrapped(
    'case "$TMPDIR" in */WORKFLOW/tmp/*) ;; *) exit 9 ;; esac; mktemp -d >/dev/null; echo "$HOME $XDG_CACHE_HOME $XDG_CONFIG_HOME $XDG_DATA_HOME $XDG_STATE_HOME"',
  );
  assert.equal(result.status, 0, result.stderr);
  const dirs = result.stdout.split("\n")[0].split(" ");
  assert.equal(dirs.length, 5);
  for (const dir of dirs)
    assert.match(dir, /\/WORKFLOW\/tmp\/project-local\/run\.[^/]+\/sentinel\//);
  assert.match(result.stdout, /project-local: ok/);
});

test("[SV-C18] a write to HOME or an XDG dir fails the run and is named", () => {
  for (const target of ['"$HOME/.npmrc"', '"$XDG_CACHE_HOME/x"', '"$XDG_STATE_HOME/y"']) {
    const result = wrapped(`echo leak > ${target}`);
    assert.equal(result.status, 1, target);
    assert.match(result.stderr, /written into the sentinel/);
  }
});

test("[SV-C18] a new system temp entry with our prefix fails the run; the command's own failure wins", () => {
  const leak = wrapped('mkdir "$FAKE_TMP/tmpabc123"');
  assert.equal(leak.status, 1);
  assert.match(leak.stderr, /new entries in .*\ntmpabc123/);
  assert.equal(wrapped("exit 7").status, 7);
});

test("[SV-C18] pnpm check runs the server test tiers through the wrapper", () => {
  const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(
    scripts["test:server"],
    "bash scripts/project-local.sh bash scripts/server-tests.sh",
  );
  assert.match(scripts.check, /vp run -w test:server/);
});
