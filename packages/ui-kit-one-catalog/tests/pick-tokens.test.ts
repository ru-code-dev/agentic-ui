import { validatePayload } from "@a2ui/agent";
import { describe, expect, it } from "vite-plus/test";
import {
  buildCatalogJson,
  CATALOG_ID,
  createContract,
  pickTokens,
  controlSizes,
} from "../src/index.ts";
import { HOW_TO_COMPONENT } from "../scripts/contracts-howto.ts";
import { assembleSystemPrompt } from "../src/prompt/index.ts";
import { withBadge } from "./support/badge.ts";

const badge = (size: string) => [
  { version: "v0.9", createSurface: { surfaceId: "s", catalogId: CATALOG_ID } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "s",
      components: [{ id: "root", component: "Badge", label: "Новый", size }],
    },
  },
];

describe("a value subset of a kit prop needs no wrapper [DEC-046] (pickTokens)", () => {
  const contract = createContract(withBadge);
  const json = buildCatalogJson(contract);
  const schema = JSON.stringify((json.components as Record<string, unknown>).Badge);

  it("lists only the picked values in catalog.json and the system prompt", () => {
    expect(schema).toContain('"enum":["sm","md"]');
    expect(schema).not.toContain('"lg"');
    expect(assembleSystemPrompt(json).text).toContain('"enum":["sm","md"]');
  });

  it("validates the picked values and rejects the rest of the source list", () => {
    expect(() => validatePayload([contract], badge("md"))).not.toThrow();
    expect(() => validatePayload([contract], badge("lg"))).toThrow();
  });

  it("returns the picked values and refuses a value outside the source list", () => {
    expect(pickTokens(controlSizes, ["sm", "lg"])).toEqual(["sm", "lg"]);
    // @ts-expect-error "xl" is not a control size: picking it is a compile error
    const outside = () => pickTokens(controlSizes, ["sm", "xl"]);
    expect(outside).toThrow("pickTokens: not in the source list: xl");
  });

  it("is documented in CONTRACTS.md with the file count of each no-wrapper case", () => {
    const section = HOW_TO_COMPONENT.split("## How to expose part of a kit prop (no wrapper)")[1];
    expect(section).toContain("| Value subset (e.g. only `sm`, `md`, `lg`) | 1: ");
    expect(section).toContain("| Renamed or merged values | 2: ");
    expect(section).toContain('| Fixed hidden kit prop (e.g. always `size="md"`) | 1: ');
    expect(section).toContain("pickTokens(sourceTokens");
  });
});
