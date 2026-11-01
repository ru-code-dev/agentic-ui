/**
 * A4b-R4: the kit types of style props accept any string (Chakra's `(string & {})`), so a value-map
 * target typo (`neutral: "grey"`) or an unmapped contract value (`brand`) type-checks and builds. This
 * test checks every `colorScheme` value the renderer sends (value-map targets and identity values)
 * against the provider's theme: the palette must exist there (it follows an owner theme, recipe 9).
 */
import { COMPONENT_APIS } from "@agentic-ui/ui-kit-one-catalog";
import { describe, expect, it } from "vite-plus/test";
import type { z } from "zod";
import { COMPONENT_MAPPINGS } from "../src/index.ts";
import { KIT_THEME } from "../src/provider.tsx";

function enumValues(schema: z.ZodTypeAny | undefined): readonly string[] {
  const def = schema?._def as { innerType?: z.ZodTypeAny; values?: readonly string[] } | undefined;
  if (def?.innerType !== undefined) return enumValues(def.innerType);
  return def?.values ?? [];
}

describe("every colorScheme value the renderer sends is a palette of the kit theme [A4b-R4]", () => {
  const sent = COMPONENT_MAPPINGS.flatMap((mapping) => {
    const prop = mapping.props.colorScheme;
    if (prop === undefined) return [];
    const api = COMPONENT_APIS.find((candidate) => candidate.name === mapping.component);
    const shape = (api?.schema as z.AnyZodObject | undefined)?.shape ?? {};
    const contract = enumValues(shape.colorScheme as z.ZodTypeAny | undefined);
    return contract.map((value) => ({
      at: `${mapping.component}.colorScheme ${value}`,
      kit: String(prop.values?.[value] ?? value),
    }));
  });

  it("covers the components with a colorScheme", () => {
    expect(sent.length).toBeGreaterThan(10);
  });

  it("finds each kit value in KIT_THEME.colors (a typo or an unknown palette fails here, not silently at runtime)", () => {
    const missing = sent
      .filter(({ kit }) => typeof KIT_THEME.colors[kit] !== "object")
      .map(({ at, kit }) => `${at} → ${kit}`);
    expect(missing).toEqual([]);
  });
});
