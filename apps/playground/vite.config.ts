import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { sourceContractVersion } from "../../packages/ui-kit-one-catalog/scripts/contract-version.ts";
import { staleDistCheck } from "./scripts/stale-dist.ts";

const PORT = 3458;
const nodeBuiltinsStub = fileURLToPath(
  new URL("./src/validation/node-builtins.browser.ts", import.meta.url),
);

/** Deployment base path, e.g. `PLAYGROUND_BASE=/agentic-ui/ pnpm build` for a subfolder. */
const base = `/${(process.env.PLAYGROUND_BASE ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace(
  /^\/\/$/,
  "/",
);

/**
 * P8: where `vp dev` / `vp preview` forward the Agent page's same-origin `/api` (its
 * AGENT_API_BASE, src/agent/endpoint.ts); the agent server's default address unless set.
 */
const agentServer = process.env.AGENT_SERVER_URL ?? "http://127.0.0.1:8787";
const proxy = { "/api": { target: agentServer, changeOrigin: false } };

/** PG-28: a fresh id per build / dev-server start; preview-channel messages of other builds are ignored. */
const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** DEC-056: the contract this page renders; every server answer must name the same version. */
const contractVersion = sourceContractVersion(); // A4-A02: no dist/ needed (fresh clone)

export default defineConfig({
  base,
  define: {
    "import.meta.env.BUILD_ID": JSON.stringify(buildId),
    "import.meta.env.CONTRACT_VERSION": JSON.stringify(contractVersion),
  },
  plugins: [react(), tailwindcss(), staleDistCheck(fileURLToPath(new URL(".", import.meta.url)))],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@emotion/react", "@chakra-ui/react"],
    alias: { fs: nodeBuiltinsStub, path: nodeBuiltinsStub },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
  },
  server: { port: PORT, strictPort: true, proxy },
  preview: { port: PORT, strictPort: true, proxy },
  build: {
    // Two chunks exceed Vite's 500 kB default by design: `kit` (the whole Chakra UI v1 runtime,
    // 506 kB) and js-tiktoken's o200k rank table (2.3 MB, fetched only when that tokenizer is picked).
    chunkSizeWarningLimit: 2400,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        // Chakra-only reference page for the scoped-preview pixel-parity check (e2e).
        reference: fileURLToPath(new URL("./reference.html", import.meta.url)),
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: "kit",
              test: /node_modules[\\/](@chakra-ui|@emotion|framer-motion|@popperjs|react-remove-scroll|react-focus-lock)/,
            },
            {
              name: "a2ui",
              test: /node_modules[\\/](@a2ui|lit|@lit|zod|antlr4ng|@preact|markdown-it|redos-detector)/,
            },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
