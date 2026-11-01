/**
 * A4-A03: both ports are checked before anything is spawned, so a port that another program (an earlier run,
 * another dev server) holds is refused at once instead of being taken for the helper's own server or page.
 */
import { createServer } from "node:net";

/** Resolves `undefined` when `host:port` can be bound right now, else the reason ("in use", "EACCES", …). */
export function portProblem(port, host) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", (error) =>
      resolve(error.code === "EADDRINUSE" ? "in use" : (error.code ?? error.message)),
    );
    probe.listen({ port, host: host || undefined, exclusive: true }, () =>
      probe.close(() => resolve(undefined)),
    );
  });
}

/** `[{ port, host, what }]` → the first one-line error (`port N in use (what)`), or `undefined` when all are free. */
export async function portsInUse(wanted) {
  for (const { port, host, what } of wanted) {
    const problem = await portProblem(port, host);
    if (problem) return `port ${port} ${problem} (${what})`;
  }
  return undefined;
}
