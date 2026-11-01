import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import type { z } from "zod";
import {
  COMPONENT_APIS,
  FUNCTION_APIS,
  TWO_WAY_BINDINGS,
  iconNames,
  boxSizes,
  colorSchemes,
  colorTokens,
  fontSizes,
  fontWeights,
  palettes,
  radii,
  shadows,
  sizes,
  space,
} from "../src/index.ts";

type AnyDef = { typeName: string; innerType?: z.ZodTypeAny; type?: z.ZodTypeAny };

/** Yields [path, schema] for every prop, including the fields of arrays of objects. */
function* props(
  shape: Record<string, z.ZodTypeAny>,
  prefix: string,
): Generator<[string, z.ZodTypeAny]> {
  for (const [name, schema] of Object.entries(shape)) {
    yield [`${prefix}.${name}`, schema];
    let inner = schema;
    while (["ZodOptional", "ZodDefault"].includes((inner._def as AnyDef).typeName))
      inner = (inner._def as AnyDef).innerType as z.ZodTypeAny;
    const def = inner._def as AnyDef;
    if (
      def.typeName === "ZodArray" &&
      def.type !== undefined &&
      (def.type._def as AnyDef).typeName === "ZodObject"
    ) {
      yield* props(
        (def.type as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>,
        `${prefix}.${name}[]`,
      );
    }
  }
}

const shapeOf = (schema: z.ZodTypeAny) =>
  (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;

describe("component contracts [INT-01, PR-01]", () => {
  it("describe every component and every prop (the prompt and CONTRACTS.md are built from them)", () => {
    const missing: string[] = [];
    for (const api of COMPONENT_APIS) {
      if ((api.schema.description ?? "").length < 20) missing.push(api.name);
      for (const [path, schema] of props(shapeOf(api.schema), api.name)) {
        const description = schema.description ?? "";
        const text = description.startsWith("REF:")
          ? (description.split("|")[1] ?? "")
          : description;
        if (text.length < 10) missing.push(path);
      }
    }
    expect(missing).toEqual([]);
  });

  it("derive every enum from src/tokens.ts or src/icons.ts (no literal enums in components)", () => {
    const dir = new URL("../src/components/", import.meta.url);
    const literalEnums = readdirSync(dir)
      .filter((file) => /z\.enum\(\[/.test(readFileSync(new URL(file, dir), "utf8")))
      .map((file) => `src/components/${file}`);
    expect(literalEnums).toEqual([]);
  });

  it("declare two-way bindings only on existing dynamic props", () => {
    for (const [component, bound] of Object.entries(TWO_WAY_BINDINGS)) {
      const api = COMPONENT_APIS.find((candidate) => candidate.name === component);
      expect(api, component).toBeDefined();
      for (const prop of bound) {
        expect(
          shapeOf(api?.schema as z.ZodTypeAny)[prop]?.description,
          `${component}.${prop}`,
        ).toMatch(/^REF:#\/\$defs\/Dynamic/);
      }
    }
  });

  it("expose the A2UI basic functions", () => {
    expect(FUNCTION_APIS.map((api) => api.name)).toEqual([
      "required",
      "regex",
      "length",
      "numeric",
      "email",
      "formatString",
      "formatNumber",
      "formatCurrency",
      "formatDate",
      "pluralize",
      "openUrl",
      "and",
      "or",
      "not",
    ]);
  });
});

describe("tokens [INT-01, PR-01]", () => {
  it("define every token group copied from the Chakra UI v1 theme", () => {
    expect(Object.keys(space)).toContain("4");
    expect(space["4"]).toBe("1rem");
    expect(palettes.blue[500]).toBe("#3182ce");
    expect(radii.lg).toBe("0.5rem");
    expect(fontSizes.md).toBe("1rem");
    expect(fontWeights.bold).toBe(700);
    expect(shadows.md).toContain("rgba");
    expect(sizes.full).toBe("100%");
    expect(sizes["container.lg"]).toBe("1024px");
    expect(boxSizes.icon["8"]).toBe("2rem");
    expect(boxSizes.avatar.md).toBe("3rem");
  });

  it("derive color tokens as palette.shade plus base colors", () => {
    expect(colorTokens).toContain("gray.700");
    expect(colorTokens).toContain("whiteAlpha.300");
    expect(colorTokens).toContain("white");
    expect(colorTokens).toHaveLength(3 + 12 * 10);
    expect(colorSchemes).toEqual([
      "gray",
      "red",
      "orange",
      "yellow",
      "green",
      "teal",
      "blue",
      "cyan",
      "purple",
      "pink",
    ]);
  });

  it("name about forty icons", () => {
    expect(iconNames.length).toBeGreaterThanOrEqual(40);
    expect(new Set(iconNames).size).toBe(iconNames.length);
  });
});
