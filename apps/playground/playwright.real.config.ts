import { defineConfig, devices } from "@playwright/test";

/**
 * Tier 4, opt-in (P8): the Agent page against the real agent server on the real qwen-code CLI, driving the
 * machine's test LLM endpoint named only by WORKFLOW/llm.env (SV-C15/SV-C17). Run:
 * `npx playwright test -c playwright.real.config.ts`. A few LLM calls per run; the spec skips when
 * WORKFLOW/llm.env is absent.
 */
const PORT = 3460;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const AGENT_PORT = 8791;
const AGENT_SERVER = `http://127.0.0.1:${AGENT_PORT}`;

export default defineConfig({
  testDir: "e2e",
  // SV-C18: test artifacts (traces, error contexts) are temp data in WORKFLOW/, not in the app folder.
  outputDir: "../../WORKFLOW/tmp/playwright-results",
  testMatch: /(agent|integration)-real\.spec\.ts$/,
  forbidOnly: true,
  reporter: [["list"]],
  timeout: 600_000,
  use: {
    baseURL: ORIGIN,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: `vp build && vp preview --port ${PORT}`,
      env: { AGENT_SERVER_URL: AGENT_SERVER },
      url: ORIGIN,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "bash e2e/agent/serve-agent.sh",
      env: { AGENT_E2E_PORT: String(AGENT_PORT), AGENT_E2E_REAL: "1" },
      url: `${AGENT_SERVER}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      // A5-07: SIGTERM, so the server's own shutdown stops its agents (Playwright's default is SIGKILL)
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
  ],
});
