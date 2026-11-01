// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { createServer } from "vite";

const config = fileURLToPath(new URL("../vite.config.ts", import.meta.url));
const importer = fileURLToPath(new URL("../src/main.tsx", import.meta.url));

async function resolver(mode: "development") {
  const server = await createServer({
    configFile: config,
    mode,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const resolve = async (id: string) =>
    (await server.environments.client.pluginContainer.resolveId(id, importer))?.id ?? "";
  return { resolve, close: () => server.close() };
}

describe("dev uses workspace sources [PG-30]", () => {
  it("the dev server resolves every workspace package to its src, not its dist", async () => {
    const { resolve, close } = await resolver("development");
    try {
      expect(await resolve("@agentic-ui/ui-kit-one-react")).toMatch(
        /packages\/ui-kit-one-react\/src\/index\.ts$/,
      );
      expect(await resolve("@agentic-ui/ui-kit-one-catalog")).toMatch(
        /packages\/ui-kit-one-catalog\/src\/index\.ts$/,
      );
      expect(await resolve("@agentic-ui/ui-kit-one-catalog/prompt")).toMatch(
        /packages\/ui-kit-one-catalog\/src\/prompt\/index\.ts$/,
      );
    } finally {
      await close();
    }
  }, 30_000);
});
