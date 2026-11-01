import { defineConfig } from "vite-plus";
import { sourceContractVersion } from "../ui-kit-one-catalog/scripts/contract-version.ts";

export default defineConfig({
  define: { "import.meta.env.CONTRACT_VERSION": JSON.stringify(sourceContractVersion()) },
  // One React instance, or hooks in the components and `act` in the tests are different copies.
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
  },
});
