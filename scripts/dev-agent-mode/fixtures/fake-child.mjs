// DEC-057 test double for a supervised child (agent server or web): answers `body` (default "ok") on `port`.
// It starts a worker in its own process group (like vite's workers: only a group stop reaches it) and a grandchild
// spawned detached, in a process group of its own (like the server's ACP agents, agent/process.py): a group stop
// does not reach it, it ends when its stdin closes, i.e. when this child is gone. Prints both pids.
// Usage: node fake-child.mjs <port> serve [body] | silent | die-now <code> | die-after <ms> <code> | ignore-term
//        | exit0-on-term
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const [port, mode, a, b] = process.argv.slice(2);
if (mode === "die-now") {
  console.error("fake child: cannot start (die-now)");
  process.exit(Number(a));
}
const idle = "setInterval(() => {}, 1000)";
const worker = spawn(process.execPath, ["-e", idle], { stdio: "ignore" });
const grandchild = spawn(
  process.execPath,
  ["-e", `process.stdin.on("end", () => process.exit(0)).resume(); ${idle}`],
  { detached: true, stdio: ["pipe", "ignore", "ignore"] },
);
console.log(`worker ${worker.pid}`);
console.log(`grandchild ${grandchild.pid}`);
if (mode === "ignore-term") process.on("SIGTERM", () => console.log("fake child: SIGTERM ignored"));
if (mode === "exit0-on-term") process.on("SIGTERM", () => process.exit(0));
if (mode !== "silent")
  createServer((_, response) => response.end(mode === "serve" && a ? a : "ok")).listen(
    Number(port),
    "127.0.0.1",
    () => console.log(`fake child: listening on ${port}`),
  );
if (mode === "die-after")
  setTimeout(() => {
    console.error("fake child: boom (die-after)");
    process.exit(Number(b));
  }, Number(a));
