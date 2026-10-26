import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { renderContractsMarkdown } from "../scripts/contracts-markdown.ts";
import { COMPONENT_APIS } from "../src/index.ts";

const committed = readFileSync(new URL("../CONTRACTS.md", import.meta.url), "utf8");

describe("CONTRACTS.md", () => {
  it("is up to date with the contract (regenerate with `pnpm docs`)", () => {
    expect(committed).toBe(renderContractsMarkdown());
  });

  it("documents every component with a props table, bindings, actions and an example", () => {
    for (const api of COMPONENT_APIS) {
      const section = committed.split(`\n### ${api.name}\n`)[1]?.split("\n### ")[0] ?? "";
      expect(section, api.name).toContain("| Prop | Type | Required | Values | Description |");
      expect(section, api.name).toContain("- Two-way bindings:");
      expect(section, api.name).toContain("- Actions:");
      expect(section, api.name).toContain(`examples/components/${api.name}.json`);
    }
    expect(committed).toContain("## Naming: passthrough first");
    expect(committed).toContain("## Styling policy");
    expect(committed).toContain("## Functions");
    expect(committed).toContain("## Tokens");
  });
});
