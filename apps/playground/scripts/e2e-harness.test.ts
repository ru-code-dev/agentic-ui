// @vitest-environment node
/**
 * A5-07 (ported from the A5 review's attack/concurrency/hold-eof.sh): the e2e fake ACP agent must not outlive its
 * client. A `#hold` turn keeps a timer pending; Playwright used to SIGKILL the agent server, which then could not
 * stop its agents, and the agent ignored the closed stdin: an orphan per run.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const agent = fileURLToPath(new URL("../e2e/agent/fake-agent.mjs", import.meta.url));
const lines = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  { jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: "/", mcpServers: [] } },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "session/prompt",
    params: { sessionId: "x", prompt: [{ type: "text", text: "#hold" }] },
  },
];

describe("[A5-07] the e2e harness leaves no agent behind", () => {
  it("[A5-07] the fake agent exits when its stdin closes, even with a #hold turn pending", async () => {
    const child = spawn(process.execPath, [agent], { stdio: ["pipe", "ignore", "ignore"] });
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    child.stdin.end();
    const code = await Promise.race([
      exited,
      new Promise<string>((resolve) => setTimeout(() => resolve("alive"), 2000)),
    ]);
    if (code === "alive") child.kill("SIGKILL");
    expect(code).toBe(0);
  });

  it("[A5-07] Playwright stops the agent server with SIGTERM (its own shutdown stops its agents)", () => {
    for (const name of ["playwright.config.ts", "playwright.real.config.ts"]) {
      const text = readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
      const server = text.slice(text.indexOf("e2e/agent/serve-agent.sh"));
      expect(server, name).toMatch(/gracefulShutdown: \{ signal: "SIGTERM"/);
    }
  });
});
