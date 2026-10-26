import { defineConfig, devices } from "@playwright/test";

const PORT = 3458;
// The preview server binds 127.0.0.1; probing `localhost` may try ::1 first and stall for minutes.
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** e2e runs against the production build, served statically like a user would get it. */
export default defineConfig({
  testDir: "e2e",
  forbidOnly: true,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: ORIGIN, permissions: ["clipboard-read", "clipboard-write"] },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "vp build && vp preview",
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
