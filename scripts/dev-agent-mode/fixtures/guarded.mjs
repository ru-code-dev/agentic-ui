// A4-A08, A4b-D1 stand-in for the helper: guards its children (guard.mjs), starts one fake child (fake-child.mjs:
// a worker in its group, a detached grandchild), prints its lines and "ready" once it listens, then
// `throw` (an uncaught error: the exit handler) or `wait` (the test SIGKILLs it: the orphan watch).
// Usage: node guarded.mjs <port> <throw|wait>
import { startChild } from "../children.mjs";
import { guardChildren } from "../guard.mjs";
import { fakeSpec } from "./test-lib.mjs";

const [port, mode] = process.argv.slice(2);
guardChildren();
// `throw`: a child that ignores SIGTERM, so only the exit handler's SIGKILL (not the watch's SIGTERM) ends it at once.
const fakeMode = mode === "throw" ? ["ignore-term"] : ["serve"];
const child = startChild(fakeSpec("fake", Number(port), fakeMode), (line) => {
  console.log(line);
  if (!line.includes("listening")) return;
  console.log(`fake (pid ${child.pid})\nready`);
  if (mode === "throw") throw new Error("guarded: an uncaught error");
});
