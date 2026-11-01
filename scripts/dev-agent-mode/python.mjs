/**
 * DEC-057: the Python that runs the agent server (SV-C1: 3.13). `$AGENTIC_UI_PYTHON`, when set, is the only
 * candidate and must be 3.13 (A4-A05: an explicit choice is never replaced silently); otherwise the first of
 * `python3.13`, `python3` that is 3.13. Lookup uses the PATH of `env` (the children's env).
 */
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

// "python X.Y.Z", so a program that only echoes a version number is not taken for Python.
const VERSION = "import sys; print('python %d.%d.%d' % sys.version_info[:3])";
const NEED = "need 3.13";

/** What `python` is: `{ version }` when it ran the probe, else `{ what }` ("not found", "Python 3.12.3", …). */
function probe(python, env) {
  if (python.includes("/") && statSync(python, { throwIfNoEntry: false })?.isDirectory())
    return { what: "a directory" };
  const run = spawnSync(python, ["-c", VERSION], { env, encoding: "utf8", timeout: 15_000 });
  if (run.error?.code === "ENOENT") return { what: "not found" };
  if (run.error?.code === "ETIMEDOUT") return { what: "not answering (15 s)" };
  if (run.error) return { what: `not runnable (${run.error.code ?? run.error.message})` };
  const version = /^python (\d+\.\d+\.\d+)$/.exec(run.stdout.trim())?.[1];
  if (run.status === 0 && version) return { version, what: `Python ${version}` };
  const said = (run.stdout || run.stderr).trim().split("\n")[0].slice(0, 60);
  return {
    what: `not Python (exit ${run.status ?? run.signal}${said ? `, printed "${said}"` : ""})`,
  };
}

const is313 = (found) => /^3\.13\.\d+$/.test(found.version ?? "");

/** `{ python, version }` of the Python to use, or `{ error }` (one line). */
export function findPython(env) {
  const chosen = env.AGENTIC_UI_PYTHON;
  if (chosen) {
    const found = probe(chosen, env);
    if (is313(found)) return { python: chosen, version: found.version };
    return { error: `AGENTIC_UI_PYTHON=${chosen} is ${found.what}, ${NEED}` };
  }
  const tried = [];
  for (const python of ["python3.13", "python3"]) {
    const found = probe(python, env);
    if (is313(found)) return { python, version: found.version };
    tried.push(`${python}: ${found.version ?? found.what}`);
  }
  return {
    error: `no Python 3.13 found (tried ${tried.join(", ")}); install Python 3.13 or set AGENTIC_UI_PYTHON=/path/to/python3.13`,
  };
}
