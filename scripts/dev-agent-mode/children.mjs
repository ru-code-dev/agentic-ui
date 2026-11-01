/**
 * DEC-057: one supervised child = its own process group (so a stop reaches everything it started: vite's
 * workers, pnpm's shells), output prefixed per line (`[server] …`) and the last lines kept for a crash report.
 * Every group from start until it is gone is in `liveGroups()` (A4-A08, A4b-D1: the exit handler and the orphan
 * watch of guard.mjs stop what is left when the helper itself dies).
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export const TAIL_LINES = 40;

const live = new Set();
let onChange = () => {};
/** The process groups (= leader pids) started and not yet seen gone. */
export const liveGroups = () => [...live];
/** `fn("add" | "del", pgid)` on every change of `liveGroups()` (one listener: guard.mjs). */
export const onGroupChange = (fn) => (onChange = fn);

/** Whether any process of group `pgid` is alive. */
export function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Sends `signal` to every process of group `pgid`; a group that is gone already is fine. */
export function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch {
    // ESRCH: the group is gone already.
  }
}

/** Calls `onLine` for every complete line of `stream` (a trailing partial line on end). */
function lines(stream, onLine) {
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const parts = (rest + chunk).split(/\r?\n/);
    rest = parts.pop() ?? "";
    for (const line of parts) onLine(line);
  });
  stream.on("end", () => rest && onLine(rest));
}

/**
 * Starts `{ name, cmd, args, cwd, env }`: `{ name, pid, exited, alive(), tail() }`; `exited` resolves with
 * `{ code, signal }` once the child and its output are done; each line goes to `write` as `[name] line`.
 */
export function startChild({ name, cmd, args, cwd, env }, write) {
  const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  if (child.pid !== undefined) {
    live.add(child.pid);
    onChange("add", child.pid);
  }
  const tail = [];
  const onLine = (line) => {
    tail.push(line);
    if (tail.length > TAIL_LINES) tail.shift();
    write(`[${name}] ${line}`);
  };
  lines(child.stdout, onLine);
  lines(child.stderr, onLine);
  const exited = new Promise((resolve) => {
    child.once("error", (error) => {
      onLine(`spawn failed: ${error.message}`);
      resolve({ code: 127, signal: null });
    });
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const alive = () =>
    child.pid !== undefined && child.exitCode === null && child.signalCode === null;
  return { name, pid: child.pid, exited, alive, tail: () => [...tail] };
}

/**
 * Stops a child and its whole process group: SIGTERM, then SIGKILL for whatever is still alive after `graceMs`
 * (the leader or a member that outlived it). Resolves when the group is gone.
 */
export async function stopChild(handle, graceMs = 5000) {
  if (handle.pid === undefined) return;
  signalGroup(handle.pid, "SIGTERM");
  const deadline = Date.now() + graceMs;
  while (groupAlive(handle.pid) && Date.now() < deadline) await delay(50);
  if (groupAlive(handle.pid)) signalGroup(handle.pid, "SIGKILL");
  await handle.exited;
  while (groupAlive(handle.pid)) await delay(20);
  if (live.delete(handle.pid)) onChange("del", handle.pid);
}

/**
 * Polls `url` until it answers (any HTTP status): `{ status, body }` (the caller judges who answered). Rejects after `timeoutMs`; `stop` (a
 * promise) ends the wait early with `undefined`.
 */
export async function waitForUrl(url, { timeoutMs = 60_000, stop = new Promise(() => {}) } = {}) {
  const state = { stopped: false };
  void stop.then(() => (state.stopped = true));
  const deadline = Date.now() + timeoutMs;
  while (!state.stopped) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      return { status: response.status, body: await response.text() };
    } catch {
      if (Date.now() > deadline)
        throw new Error(`${url} did not answer within ${timeoutMs / 1000} s`);
      await delay(250);
    }
  }
  return undefined;
}
