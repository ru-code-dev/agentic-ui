import {
  A2uiGenerator,
  CatalogConfig,
  DirectJsonFormatFactory,
  InMemoryCatalogProvider,
} from "@a2ui/agent";
import { describe, expect, it } from "vite-plus/test";
import { readExamples } from "../scripts/examples.ts";
import { buildCatalogJson, CATALOG_ID } from "../src/index.ts";
import { responseText } from "../src/prompt/index.ts";

const catalogJson = buildCatalogJson();
const login = readExamples("compositions").find((example) => example.file.includes("01-login"));

describe("responseText", () => {
  it("writes a compact <a2ui-json> block that the agent SDK parses back", () => {
    const text = responseText(catalogJson, login?.messages ?? [], "direct-json");
    expect(text.startsWith("<a2ui-json>[")).toBe(true);
    const catalog = new InMemoryCatalogProvider(catalogJson, "v0.9", CATALOG_ID).load();
    const processor = new A2uiGenerator(
      [new CatalogConfig(catalog)],
      undefined,
      new DirectJsonFormatFactory(),
    ).createProcessor({
      "v0.9": { supportedCatalogIds: [CATALOG_ID] },
    });
    expect(processor.parseResponse(text).map((part) => part.type)).toEqual(["a2ui"]);
  });

  it("writes Express DSL that is shorter than the JSON", () => {
    const express = responseText(catalogJson, login?.messages ?? [], "express");
    expect(express).toContain("<a2ui>");
    expect(express).toContain('surface("login")');
    expect(express.length).toBeLessThan(
      responseText(catalogJson, login?.messages ?? [], "direct-json").length,
    );
  });
});
