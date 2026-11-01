/**
 * DEC-057 + SV-C18: the helper's children run in the project-local env without the user sourcing anything:
 * the env is what `. scripts/workflow-env.sh` exports (TMPDIR, XDG_*, VP_HOME, caches, PATH → WORKFLOW/), read
 * from that one script (bash), so the helper never keeps its own copy of the list. It only creates folders under
 * WORKFLOW/; no setup-workflow.sh is needed. HOME stays the user's: the agent CLI keeps its own login there.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** The env `. scripts/workflow-env.sh` gives a shell started with `base` (dumped by node as JSON: no GNU `env -0`). */
export function projectEnv(root, base = process.env) {
  const script = join(root, "scripts", "workflow-env.sh");
  const dump = "process.stdout.write(JSON.stringify(process.env))";
  const run = spawnSync(
    "bash",
    [
      "-c",
      '. "$1" >/dev/null && exec "$2" -e "$3"',
      "workflow-env",
      script,
      process.execPath,
      dump,
    ],
    { env: base, encoding: "utf8" },
  );
  if (run.status !== 0) throw new Error(`could not source ${script}: ${run.stderr || run.error}`);
  const env = JSON.parse(run.stdout);
  delete env._; // bash's "last command", not part of the env
  return env;
}
