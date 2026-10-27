import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const PORT = 3458;
const nodeBuiltinsStub = fileURLToPath(
  new URL("./src/validation/node-builtins.browser.ts", import.meta.url),
);

/** Deployment base path, e.g. `PLAYGROUND_BASE=/agentic-ui/ pnpm build` for a subfolder. */
const base = `/${(process.env.PLAYGROUND_BASE ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace(
  /^\/\/$/,
  "/",
);

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@emotion/react", "@chakra-ui/react"],
    alias: { fs: nodeBuiltinsStub, path: nodeBuiltinsStub },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
  },
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
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
