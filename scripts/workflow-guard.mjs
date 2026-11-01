/**
 * SV-C18: the root pnpm scripts that build, test or serve (`check`, `build`, `test`, `e2e`, `dev`) refuse to run
 * outside the project-local dev shell (`. scripts/workflow-env.sh`): without it vite-plus, Chromium/fontconfig,
 * Playwright, uv and npm fall back to HOME (~/.vite-plus, ~/.fontconfig, ~/.cache, ...), outside the project.
 * pnpm's own pre-script work (its packageManager switch) cannot be guarded from here; the env covers it too.
 * Usage: node scripts/workflow-guard.mjs   (exit 1 + the variables that point outside WORKFLOW/)
 */
import { resolve, sep } from "node:path";
import { argv, env, exit } from "node:process";
import { fileURLToPath } from "node:url";

export const GUARDED = [
  "TMPDIR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "VP_HOME",
];

/** Names of GUARDED variables of `vars` that are unset or point outside `<root>/WORKFLOW/`. */
export function outsideWorkflow(vars, root) {
  const workflow = resolve(root, "WORKFLOW") + sep;
  return GUARDED.filter(
    (name) => !vars[name] || !`${resolve(vars[name])}${sep}`.startsWith(workflow),
  );
}

if (argv[1] === fileURLToPath(import.meta.url)) {
  const outside = outsideWorkflow(env, fileURLToPath(new URL("..", import.meta.url)));
  if (outside.length > 0) {
    console.error(
      `workflow-guard: ${outside.join(", ")} not inside WORKFLOW/ (SV-C18). Run \`. scripts/workflow-env.sh\` first.`,
    );
    exit(1);
  }
}
