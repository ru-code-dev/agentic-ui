// @vitest-environment node
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const here = createRequire(import.meta.url);
const packageDir = (name: string, from = here) => dirname(from.resolve(`${name}/package.json`));
const requireFrom = (dir: string) => createRequire(join(dir, "package.json"));

describe("dependency graph", () => {
  it("shares one zod between the renderer, the contract and the A2UI libraries", () => {
    const own = here.resolve("zod");
    const contractDir = fileURLToPath(new URL("../../ui-kit-one-catalog/", import.meta.url));
    const reactDir = dirname(dirname(here.resolve("@a2ui/react")));
    const webCoreDir = dirname(
      dirname(dirname(requireFrom(contractDir).resolve("@a2ui/web_core"))),
    );
    expect(requireFrom(contractDir).resolve("zod")).toBe(own);
    expect(requireFrom(reactDir).resolve("zod")).toBe(own);
    expect(requireFrom(webCoreDir).resolve("zod")).toBe(own);
  });

  it("shares one React between the renderer, Chakra UI and @a2ui/react", () => {
    const own = here.resolve("react");
    const chakraDir = packageDir("@chakra-ui/react");
    expect(requireFrom(chakraDir).resolve("react")).toBe(own);
    expect(requireFrom(dirname(dirname(here.resolve("@a2ui/react")))).resolve("react")).toBe(own);
  });
});
