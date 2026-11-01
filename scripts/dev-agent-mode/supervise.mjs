/**
 * DEC-057: runs the agent server and the playground dev server as one unit. The server starts first; the web
 * starts once the server's /health answers; `onReady` prints the URLs once the page answers too. A child counts
 * as up only while it is itself running and its answer passes `accept` (A4-A03: never another program's). A stop
 * request (Ctrl+C) stops both and resolves 0; a child that dies stops the other and resolves with the dead
 * child's exit code, never 0 (A4-A06: nobody asked it to stop), after printing its last log lines.
 */
import { startChild, stopChild, waitForUrl } from "./children.mjs";

const SERVER_GRACE_MS = 8000; // the server closes its agent processes on SIGTERM (kill_grace_s 2 s each)
const WEB_GRACE_MS = 5000;

/** Exit code for an unexpected child exit `{ code, signal }`: its code, 1 for code 0 or a signal. */
const exitCode = ({ code }) => code || 1;

/** The event of a running child's exit. */
const died = (child) => child.exited.then((result) => ({ kind: "died", child, result }));

/**
 * `server` / `web`: `{ name, cmd, args, cwd, env, ready, accept? }` (`ready` = the URL that answers once it is up;
 * `accept({ status, body })` = whether that answer is from this child, default any).
 * `stop`: a promise that resolves on a stop request. `log(line)` for the helper's own lines, `write(line)` for
 * child output. Resolves with the helper's exit code.
 */
export async function supervise({
  server,
  web,
  stop,
  log,
  write = log,
  onServerReady = () => {},
  onReady = () => {},
  startTimeoutMs = 90_000,
}) {
  const running = [];
  const stopAll = () =>
    Promise.all(
      running.map((child) =>
        stopChild(child, child.name === server.name ? SERVER_GRACE_MS : WEB_GRACE_MS),
      ),
    );
  const stopped = stop.then(() => ({ kind: "stop" }));

  /**
   * Waits for `spec.ready` while watching every running child and the stop request (the poll ends with the
   * race). An answer counts only while `child` runs and `spec.accept` takes it, else it is `foreign`.
   */
  const ready = async (spec, child) => {
    const { promise: settled, resolve: settle } = Promise.withResolvers();
    const { ready: url, accept = () => true } = spec;
    try {
      const event = await Promise.race([
        waitForUrl(url, { timeoutMs: startTimeoutMs, stop: Promise.race([stop, settled]) }).then(
          (answer) => ({ kind: "ready", answer }),
          (error) => ({ kind: "timeout", error }),
        ),
        stopped,
        ...running.map(died),
      ]);
      if (event.kind !== "ready") return event;
      if (!child.alive()) return died(child);
      return accept(event.answer) ? event : { kind: "foreign", url, child, answer: event.answer };
    } finally {
      settle();
    }
  };

  /** Handles a non-ready event: stops everything; the exit code. */
  const finish = async (event) => {
    if (event.kind === "stop") log("stopping the agent server and the web dev server");
    if (event.kind === "timeout") log(`${event.error.message}; stopping`);
    if (event.kind === "foreign") {
      const { url, child, answer } = event;
      const text = answer.body.replace(/\s+/g, " ").slice(0, 120);
      log(
        `${url} answered HTTP ${answer.status}, but not as the ${child.name}: "${text}"; stopping`,
      );
    }
    if (event.kind === "died") {
      const { child, result } = event;
      const how = result.signal ? `signal ${result.signal}` : `code ${result.code}`;
      log(`the ${child.name} exited (${how}); its last log lines:`);
      for (const line of child.tail()) log(`  ${line}`);
    }
    await stopAll();
    log("stopped");
    if (event.kind === "stop") return 0;
    return event.kind === "died" ? exitCode(event.result) : 1;
  };

  running.push(startChild(server, write));
  log(`${server.name} started (pid ${running[0].pid}): ${[server.cmd, ...server.args].join(" ")}`);
  const up = await ready(server, running[0]);
  if (up.kind !== "ready") return finish(up);
  onServerReady(up.answer);

  running.push(startChild(web, write));
  log(`${web.name} started (pid ${running[1].pid}): ${[web.cmd, ...web.args].join(" ")}`);
  const page = await ready(web, running[1]);
  if (page.kind !== "ready") return finish(page);
  onReady();

  return finish(await Promise.race([stopped, ...running.map(died)]));
}
