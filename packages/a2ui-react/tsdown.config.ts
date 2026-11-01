import { defineConfig } from "tsdown";
import { sourceContractVersion } from "../ui-kit-one-catalog/scripts/contract-version.ts";

/** The React entry is a client module (RSC hosts); the core entry stays importable on a server (SV-C26). */
const CLIENT_ENTRY = "index";

/**
 * SV-C26: one package that BUNDLES the workspace code (ui-kit-one-catalog, ui-kit-one-react, the client) and
 * their types; `@a2ui/*` and `zod` stay regular dependencies, React and the kit stay peers.
 */
export default defineConfig({
  entry: { index: "src/react/index.ts", core: "src/core/index.ts" },
  format: "esm",
  platform: "neutral",
  noExternal: [/^@agentic-ui\//],
  // The workspace packages are bundled from their sources (`development` condition): no stale or missing dist.
  inputOptions: { resolve: { conditionNames: ["development", "import", "default"] } },
  dts: { tsgo: true, tsconfig: "../tsconfig.a2ui-react-dts.json" },
  define: { "import.meta.env.CONTRACT_VERSION": JSON.stringify(sourceContractVersion()) },
  outputOptions: {
    banner: (chunk) => (chunk.isEntry && chunk.name === CLIENT_ENTRY ? '"use client";' : ""),
  },
  sourcemap: false,
  clean: true,
  outDir: "dist",
});
