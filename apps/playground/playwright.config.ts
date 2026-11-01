import { defineConfig, devices } from "@playwright/test";

const PORT = 3458;
// The preview server binds 127.0.0.1; probing `localhost` may try ::1 first and stall for minutes.
const ORIGIN = `http://127.0.0.1:${PORT}`;
/** PG-27: the same app built for a subfolder (PLAYGROUND_BASE) and served from its own port. */
const SUBPATH = "/agentic-ui/";
const SUBPATH_PORT = 3459;
const SUBPATH_ORIGIN = `http://127.0.0.1:${SUBPATH_PORT}`;

/** P8: the real agent server process on the deterministic fake ACP agent (e2e/agent/serve-agent.sh). */
const AGENT_PORT = 8790;
const AGENT_SERVER = `http://127.0.0.1:${AGENT_PORT}`;

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } };

/** e2e runs against the production build, served statically like a user would get it. */
export default defineConfig({
  testDir: "e2e",
  // SV-C18: test artifacts (traces, error contexts) are temp data in WORKFLOW/, not in the app folder.
  outputDir: "../../WORKFLOW/tmp/playwright-results",
  forbidOnly: true,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: ORIGIN, permissions: ["clipboard-read", "clipboard-write"] },
  projects: [
    {
      name: "chromium",
      testIgnore: /(subpath|agent-real|integration-real)\.spec\.ts$/,
      use: desktop,
    },
    {
      name: "subpath",
      testMatch: /subpath\.spec\.ts$/,
      use: { ...desktop, baseURL: `${SUBPATH_ORIGIN}${SUBPATH}` },
    },
  ],
  webServer: [
    {
      command: "vp build && vp preview",
      env: { AGENT_SERVER_URL: AGENT_SERVER },
      url: ORIGIN,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `vp build --outDir dist-subpath && vp preview --outDir dist-subpath --port ${SUBPATH_PORT}`,
      env: { PLAYGROUND_BASE: SUBPATH },
      url: `${SUBPATH_ORIGIN}${SUBPATH}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "bash e2e/agent/serve-agent.sh",
      env: { AGENT_E2E_PORT: String(AGENT_PORT) },
      url: `${AGENT_SERVER}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      // A5-07: SIGTERM, so the server's own shutdown stops its agents (Playwright's default is SIGKILL)
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
  ],
});
