import {
  A2uiGenerator,
  CatalogConfig,
  DirectJsonFormatFactory,
  InMemoryCatalogProvider,
} from "@a2ui/agent";
import { describe, expect, it } from "vite-plus/test";
import { readExamples } from "../scripts/examples.ts";
import { buildCatalogJson, CATALOG_ID } from "../src/index.ts";
import { approxTokens, assembleSystemPrompt } from "../src/prompt/index.ts";

const catalogJson = buildCatalogJson();
const examples = readExamples("components").slice(0, 3);
const agentProcessor = () => {
  const catalog = new InMemoryCatalogProvider(catalogJson, "v0.9", CATALOG_ID).load();
  return new A2uiGenerator(
    [new CatalogConfig(catalog)],
    undefined,
    new DirectJsonFormatFactory(),
  ).createProcessor({
    "v0.9": { supportedCatalogIds: [CATALOG_ID] },
  });
};

describe("assembleSystemPrompt", () => {
  it("is exactly @a2ui/agent's Direct JSON prompt snippet when used without options", () => {
    expect(assembleSystemPrompt(catalogJson).text).toBe(agentProcessor().promptSnippet);
  });

  it("splits the prompt into consecutive sections that add up to the whole text", () => {
    for (const format of ["direct-json", "express"] as const) {
      const prompt = assembleSystemPrompt(catalogJson, {
        format,
        examples,
        instructions: "Ты — ассистент банка.",
      });
      expect(prompt.sections.map((section) => section.text).join("")).toBe(prompt.text);
      expect(prompt.sections[0]).toMatchObject({
        id: "instructions",
        text: "Ты — ассистент банка.\n\n",
      });
      expect(prompt.sections.map((section) => section.id)).toEqual(
        format === "direct-json"
          ? [
              "instructions",
              "base-rules",
              "envelope",
              "common-types",
              "catalog-rules",
              "components",
              "functions",
              "defs",
              "examples",
            ]
          : ["instructions", "base-rules", "components", "functions", "catalog-rules", "examples"],
      );
    }
  });

  it("states the <a2ui-json> response contract and embeds catalog, rules and examples", () => {
    const { text } = assembleSystemPrompt(catalogJson, { examples });
    expect(text).toContain("<a2ui-json>");
    expect(text).toContain("MUST validate against the provided A2UI JSON SCHEMA");
    expect(text).toContain(CATALOG_ID);
    expect(text).toContain("ui-kit-one rules:");
    for (const example of examples)
      expect(text).toContain(JSON.stringify(example.messages, null, 2));
  });

  it("prunes components with ComponentPruningTransformer", () => {
    const pruned = assembleSystemPrompt(catalogJson, { components: ["Text", "Button"] });
    expect(Object.keys(pruned.catalog.components as object)).toEqual(["Text", "Button"]);
    expect(pruned.text.length).toBeLessThan(assembleSystemPrompt(catalogJson).text.length);
  });

  it("grows with the example count and stays within a sane token budget", () => {
    const bare = assembleSystemPrompt(catalogJson);
    expect(assembleSystemPrompt(catalogJson, { examples }).text.length).toBeGreaterThan(
      bare.text.length,
    );
    expect(approxTokens(bare.text)).toBeLessThan(25_000);
  });

  it("produces a format whose replies parse back into validated messages", () => {
    const modal = examples.find((example) => example.name === "Button") ?? examples[0];
    const parts = agentProcessor().parseResponse(
      `Готово.\n<a2ui-json>${JSON.stringify(modal?.messages)}</a2ui-json>`,
    );
    expect(parts.map((part) => part.type)).toEqual(["text", "a2ui"]);
  });
});
