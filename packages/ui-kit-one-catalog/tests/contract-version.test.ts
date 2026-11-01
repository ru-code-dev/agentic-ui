import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { catalogJsonText } from "../scripts/artifacts.ts";
import { contractVersionOf, sourceContractVersion } from "../scripts/contract-version.ts";

const repo = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), "utf8");

describe("contract version (DEC-056) [DEC-056]", () => {
  it("is computed like the hand-over manifest's contractVersion (same algorithm, one value)", () => {
    const manifest = JSON.parse(read("handover/manifest.json")) as { contractVersion: string };
    expect(contractVersionOf(read("handover/catalog.json"))).toBe(manifest.contractVersion);
  });

  it("names the catalog id and changes with every byte of the contract", () => {
    const text = catalogJsonText();
    expect(contractVersionOf(text)).toMatch(
      /^urn:agentic-ui:catalog:ui-kit-one:v1 sha256:[0-9a-f]{12}$/,
    );
    expect(contractVersionOf(`${text} `)).not.toBe(contractVersionOf(text));
  });

  it("[A4-A02] the playground's version comes from the source, equal to the server's tracked data (no dist/ needed)", () => {
    const server = read("apps/agent-server/src/agentic_ui_server/data/catalog.json");
    expect(sourceContractVersion()).toBe(contractVersionOf(server));
    expect(read("apps/playground/vite.config.ts")).toMatch(
      /contractVersion = sourceContractVersion\(\)/,
    );
  });
});
