/**
 * A4-A08, A4b-D1: no child of the helper outlives it, however the helper ends. The children run detached (each
 * its own process group, so the group stop of children.mjs reaches vite's workers), which means no terminal
 * signal and no parent death reaches them by itself. Two guards:
 * - a synchronous `exit` handler: SIGKILL to every group still in `liveGroups()` (an uncaught error, an exit
 *   from anywhere: the normal path has stopped them all already, so it does nothing then);
 * - an orphan watch: a small detached process (this file run as a script) with a stdin pipe from the helper that
 *   is told every group (`add <pgid>` / `del <pgid>`). When the pipe ends (the helper is gone, also by SIGKILL,
 *   which no handler sees) it stops the groups still listed: SIGTERM (the server closes its agent processes),
 *   SIGKILL after the grace time, then exits.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { groupAlive, liveGroups, onGroupChange, signalGroup } from "./children.mjs";

const SELF = fileURLToPath(import.meta.url);
export const WATCH_GRACE_MS = 8000; // = the server's stop grace in supervise.mjs

/** Installs both guards for the children started from now on; returns `close()` (ends the watch: no groups). */
export function guardChildren() {
  process.on("exit", () => {
    for (const pgid of liveGroups()) signalGroup(pgid, "SIGKILL");
  });
  const watch = spawn(process.execPath, [SELF, "--watch"], {
    detached: true, // its own session: a terminal's Ctrl+C, Ctrl+\ or hang-up does not end it
    stdio: ["pipe", "ignore", "ignore"],
  });
  watch.unref();
  watch.stdin.unref(); // the helper's exit is never held up by the watch
  watch.stdin.on("error", () => {}); // a watch that died: the exit handler is still there
  const tell = (op, pgid) => watch.stdin.writable && watch.stdin.write(`${op} ${pgid}\n`);
  for (const pgid of liveGroups()) tell("add", pgid);
  onGroupChange(tell);
  return () => {
    onGroupChange(() => {});
    watch.stdin.end();
  };
}

/** The watch process: reads `add`/`del` lines; on end of input stops what is still listed and exits. */
async function watchGroups() {
  for (const signal of ["SIGINT", "SIGHUP", "SIGQUIT"]) process.on(signal, () => {});
  const groups = new Set();
  let rest = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      const [op, pgid] = line.split(" ");
      if (op === "add") groups.add(Number(pgid));
      if (op === "del") groups.delete(Number(pgid));
    }
  }
  const left = [...groups].filter(groupAlive);
  for (const pgid of left) signalGroup(pgid, "SIGTERM");
  const deadline = Date.now() + WATCH_GRACE_MS;
  while (left.some(groupAlive) && Date.now() < deadline) await delay(100);
  for (const pgid of left.filter(groupAlive)) signalGroup(pgid, "SIGKILL");
}

if (process.argv[1] === SELF && process.argv[2] === "--watch") await watchGroups();
