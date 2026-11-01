// @vitest-environment node
/**
 * SV-C26 proof: the PACKED tarball (`pnpm pack`, prepack = tsdown) installed into an empty sample project under
 * WORKFLOW/tmp with `--ignore-workspace` (no workspace links; the bundled ui-kit-one packages are not installed),
 * built with the Vite it installs, served with a scripted minimal server (only /prompt and /action), and driven in
 * Chromium: its own surface renders, a chat turn creates a surface, a button action updates it in place. A second
 * sample installs the same tarball with npm next to another Chakra 1.x (the peers are caret ranges, D3-01) and pins
 * what a Node SSR import gets (A5-04: `/core` works, the client entry is browser-only).
 */
import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vite-plus/test";

const PACKAGE = join(import.meta.dirname, "..");
const ROOT = join(PACKAGE, "../..");
const PEERS = {
  "@chakra-ui/icons": "1.1.7",
  "@chakra-ui/react": "1.8.9",
  "@emotion/react": "11.14.0",
  "@emotion/styled": "11.14.1",
  "framer-motion": "6.5.1",
  react: "18.3.1",
  "react-dom": "18.3.1",
  vite: "npm:@voidzero-dev/vite-plus-core@0.2.2",
};

/** D3-01: another Chakra 1.x patch / icons minor than the repo's, inside the package's peer ranges. */
const OTHER_CHAKRA = { "@chakra-ui/icons": "1.1.5", "@chakra-ui/react": "1.8.8" };

const run = (cwd: string, command: string, args: string[]) =>
  execFileSync(command, args, { cwd, stdio: "pipe", encoding: "utf8", timeout: 240_000 });

/**
 * PKG-A-O3: the notices a consumer sees, as the package README documents them. Build: Vite's "externalized
 * for browser compatibility" for @a2ui/agent's fs/path helpers and its chunk-size hint. Dev mode only: stock
 * Chakra 1.x's ReactDOM.render warning and Lit's dev-mode notice. Production console: clean.
 */
const BUILD_NOTICES = [/Module "(fs|path)" has been externalized .*@a2ui[+/]agent/s, /chunk/i];
const DEV_NOTICES = [/ReactDOM\.render is no longer supported in React 18/, /Lit is in dev mode/];
const unexpected = (messages: readonly string[], allowed: readonly RegExp[]) =>
  messages.filter((message) => !allowed.some((pattern) => pattern.test(message)));

/** The sample on the Vite dev server: the console warnings and errors of its first render. */
async function devNotices(sample: string, browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const dev = spawn("node", ["dev.mjs"], { cwd: sample, stdio: ["ignore", "pipe", "inherit"] });
  try {
    const url = await new Promise<string>((resolve) =>
      dev.stdout.on("data", (chunk: Buffer) => resolve(String(chunk).trim())),
    );
    const page = await browser.newPage();
    const notices: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") notices.push(message.text());
    });
    await page.goto(url);
    await page.getByText("Статика").waitFor({ timeout: 60_000 });
    await page.close();
    return notices;
  } finally {
    dev.kill();
  }
}

mkdirSync(join(ROOT, "WORKFLOW/tmp"), { recursive: true });
const dir = mkdtempSync(join(ROOT, "WORKFLOW/tmp/pkg-tarball-"));
let passed = 0;
afterAll(() => {
  if (passed === 2) rmSync(dir, { recursive: true, force: true });
});
/** The packed tarball's file name in `dir` (packed once). */
const packed = () => {
  const find = () => readdirSync(dir).find((name) => name.endsWith(".tgz"));
  if (find() === undefined) run(PACKAGE, "pnpm", ["pack", "--pack-destination", dir]);
  return find();
};
/** A copy of tests/tarball/sample under `dir` with the tarball and `peers` as its dependencies. */
const sampleWith = (name: string, peers: Record<string, string>) => {
  const sample = join(dir, name);
  cpSync(join(import.meta.dirname, "tarball/sample"), sample, { recursive: true });
  const dependencies = { "@agentic-ui/a2ui-react": `file:../${packed()}`, ...peers };
  writeFileSync(
    join(sample, "package.json"),
    JSON.stringify({ name: "sample", private: true, type: "module", dependencies }),
  );
  return sample;
};

describe("packed tarball in a sample project outside the workspace [SV-C26]", () => {
  it("[SV-C26] installs without workspace links, builds, renders a surface and runs a scripted chat turn", async () => {
    expect(packed()).toBeDefined();
    const sample = sampleWith("sample", PEERS);
    run(sample, "pnpm", [
      "install",
      "--ignore-workspace",
      "--prefer-offline",
      "--config.strict-peer-dependencies=false",
    ]);

    const installed = realpathSync(join(sample, "node_modules/@agentic-ui/a2ui-react"));
    expect(installed.startsWith(join(sample, "node_modules/.pnpm"))).toBe(true);
    expect(readdirSync(join(sample, "node_modules/@agentic-ui"))).toEqual(["a2ui-react"]);
    expect(existsSync(join(installed, "src"))).toBe(false);

    // a consumer's `vite build` runs in production (Vitest's NODE_ENV=test would select dev builds of deps)
    execFileSync("node", ["build.mjs"], {
      cwd: sample,
      stdio: "pipe",
      timeout: 240_000,
      env: { ...process.env, NODE_ENV: "production" },
    });
    const warnings = JSON.parse(
      readFileSync(join(sample, "build-warnings.json"), "utf8"),
    ) as string[];
    expect(unexpected(warnings, BUILD_NOTICES)).toEqual([]);
    const { serve } = (await import(pathToFileURL(join(sample, "server.mjs")).href)) as {
      serve: (at: string) => Promise<{ url: string; close: () => Promise<void> }>;
    };
    const server = await serve(sample);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      const consoleNotices: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        // the sample server has no /models: its 404 probe is the only expected browser notice
        if (["warning", "error"].includes(message.type()) && !/status of 404/.test(message.text()))
          consoleNotices.push(message.text());
      });
      await page.goto(server.url);
      await page.getByText("Статика").waitFor();
      expect(await page.getByTestId("version").textContent()).toMatch(/sha256:[0-9a-f]{12} true$/);

      await page.getByRole("textbox").fill("Покажи приветствие");
      await page.getByRole("button", { name: "Отправить" }).click();
      await page.getByText("Привет из агента").waitFor();
      await page.getByRole("button", { name: "Ещё" }).click();
      await page.getByText("Обновлено").waitFor();

      const turns = page.getByTestId("a2ui-turn");
      expect(
        await turns.evaluateAll((all) => all.map((t) => t.getAttribute("data-state"))),
      ).toEqual(["ui", "ui"]);
      // placement "follow": the surface, updated in place, moved under the action's turn
      expect(await turns.nth(1).getByTestId("a2ui-surface").getAttribute("data-surface-id")).toBe(
        "s1",
      );
      expect(await page.getByTestId("a2ui-surface").count()).toBe(1);
      expect(errors).toEqual([]);
      expect(consoleNotices).toEqual([]); // production build: a clean console
      expect(unexpected(await devNotices(sample, browser), DEV_NOTICES)).toEqual([]);
      passed++;
    } finally {
      await browser.close();
      await server.close();
    }
  }, 300_000);

  it("[D3-01, A5-04] npm installs it next to another Chakra 1.x; /core is SSR-safe, the client entry browser-only", () => {
    const sample = sampleWith("sample-npm", { ...PEERS, ...OTHER_CHAKRA });
    run(sample, "npm", ["install", "--no-audit", "--no-fund"]); // no --legacy-peer-deps: ERESOLVE would throw
    const version = (name: string) =>
      (
        JSON.parse(readFileSync(join(sample, "node_modules", name, "package.json"), "utf8")) as {
          version: string;
        }
      ).version;
    expect([version("@chakra-ui/react"), version("@chakra-ui/icons")]).toEqual(["1.8.8", "1.1.5"]);
    execFileSync("node", ["build.mjs"], {
      cwd: sample,
      stdio: "pipe",
      timeout: 240_000,
      env: { ...process.env, NODE_ENV: "production" },
    });
    // A5-04: pinned so an upstream fix (or a new break of /core) is noticed; README "Next.js / SSR"
    expect(JSON.parse(run(sample, "node", ["ssr.mjs"]))).toEqual({
      core: "idle",
      client: "ReferenceError: HTMLElement is not defined",
    });
    passed++;
  }, 300_000);
});
