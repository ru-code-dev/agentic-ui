/**
 * DEC-034 stale check for the agent server's bundled data (part of root `check:generated`): the committed
 * (git index) copy of every file in src/agentic_ui_server/data/ must equal what server-data.mjs generates
 * now, so a contract or token change that was not synced (`pnpm run server:sync-data`) fails `pnpm check`.
 * A file in data/ that server-data.mjs does not generate fails too (it would ship in the pyz), and so does a file
 * in validator-cases/ other than the generated cases.json and its README (it would not reach handover/).
 * A3-29: the three files the server's Python generators write (validator-cases/cases.json, fallback.json,
 * SERVER-CONTRACT.md) are compared the same way (index + disk vs a fresh `--print`), so a stale or hand-edited one
 * and its hand-over copy can no longer agree with each other and pass. A generator that refuses (an invalid
 * fallback or example payload, an invalid example in the corpus) fails the check with its message.
 * `--against <dir>` compares the data files with the files in <dir> instead (used by tests/agreement/test_server_data.py).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { compareGenerated, report } from "../../../scripts/generated/compare.ts";
import { VALIDATOR_CASES_DIR, VALIDATOR_CASES_FILES } from "../../../scripts/handover/bundle.mjs";
import { DATA_DIR, foreignFiles, serverData } from "./server-data.mjs";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

/** Generated file → its Python generator (run from apps/agent-server with `--print`). */
export const PYTHON_GENERATED = {
  [`${VALIDATOR_CASES_DIR}/cases.json`]: ["-m", "tests.agreement.validator_cases"],
  "fallback.json": ["-m", "agentic_ui_server.conversation.fallback"],
  "SERVER-CONTRACT.md": ["-m", "agentic_ui_server.http.contract_doc"],
};

function pythonGenerated(problems) {
  const python = process.env.WORKFLOW_PYTHON || "python3.13";
  const out = {};
  for (const [path, args] of Object.entries(PYTHON_GENERATED)) {
    const run = spawnSync(python, [...args, "--print"], {
      cwd: pkgDir,
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: join(pkgDir, "src") },
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status === 0) out[path] = run.stdout;
    else
      problems.push(
        `${path}: its generator failed (${python} ${args.join(" ")} --print):\n${run.stderr.trim()}`,
      );
  }
  return out;
}
const data = serverData();
const generated = Object.keys(data).map((path) => basename(path));
const at = argv.indexOf("--against");
let problems;
if (at >= 0) {
  const dir = argv[at + 1];
  problems = Object.entries(data).flatMap(([path, fresh]) => {
    const file = join(dir, basename(path));
    if (!existsSync(file)) return [`${path}: missing in ${dir}`];
    return readFileSync(file, "utf8") === fresh
      ? []
      : [`${path}: stale (run pnpm run server:sync-data)`];
  });
  for (const name of foreignFiles(dir, generated))
    problems.push(`${name}: not generated (in ${dir})`);
} else {
  const failed = [];
  const python = pythonGenerated(failed);
  problems = [...compareGenerated(pkgDir, { ...data, ...python }), ...failed];
  for (const name of foreignFiles(join(pkgDir, DATA_DIR), generated))
    problems.push(
      `${DATA_DIR}/${name}: not generated, would ship in the pyz (delete it; pnpm build prunes it)`,
    );
  for (const name of foreignFiles(join(pkgDir, VALIDATOR_CASES_DIR), VALIDATOR_CASES_FILES))
    problems.push(`${VALIDATOR_CASES_DIR}/${name}: not part of the validator cases (delete it)`);
}
report(
  "agent-server",
  problems,
  Object.keys(data).length + (at >= 0 ? 0 : Object.keys(PYTHON_GENERATED).length),
);
