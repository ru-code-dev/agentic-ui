import type { ComponentApi, FunctionApi } from "@a2ui/web_core/v0_9";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { componentProps } from "../src/contract-view.ts";
import { propDoc, type PropDoc } from "../src/docs/prop-docs.ts";
import { assembleSystemPrompt } from "../src/prompt/index.ts";
import {
  buildCatalogJson,
  CATALOG_INSTRUCTIONS,
  iconNames,
  avatarSizeTokens,
  borderWidthTokens,
  buttonVariants,
  colorSchemes,
  colorTokens,
  controlSizes,
  directions,
  flexAligns,
  flexJustifies,
  flexWraps,
  fontSizeTokens,
  fontWeightTokens,
  headingElements,
  headingSizes,
  iconSizeTokens,
  inputTypes,
  listVariants,
  modalSizes,
  radiusTokens,
  shadowTokens,
  sizeTokens,
  spaceTokens,
  tableColumnFormats,
  tableVariants,
  tabsVariants,
  tagVariants,
  textAligns,
} from "../src/index.ts";
import { CONTRACT_SOURCE } from "../src/catalog.ts";
import { prop } from "../src/prop-kinds.ts";
import {
  buildInstructions,
  catalogRules,
  HANDWRITTEN_RULES,
  interactionRules,
  type ContractSource,
} from "../src/rules/index.ts";
import { withSlider } from "./support/slider.ts";

const shapeOf = (schema: unknown) =>
  (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
const fieldNames = (docs: readonly PropDoc[]): string[] =>
  docs.flatMap((d) => [d.name, ...fieldNames(d.items ?? [])]);

/** Every token and option list of `src/tokens/` (DEC-050: named, no namespace import). */
const TOKEN_LISTS: readonly (readonly (string | number)[])[] = [
  avatarSizeTokens,
  borderWidthTokens,
  buttonVariants,
  colorSchemes,
  colorTokens,
  controlSizes,
  directions,
  flexAligns,
  flexJustifies,
  flexWraps,
  fontSizeTokens,
  fontWeightTokens,
  headingElements,
  headingSizes,
  iconSizeTokens,
  inputTypes,
  listVariants,
  modalSizes,
  radiusTokens,
  shadowTokens,
  sizeTokens,
  spaceTokens,
  tableColumnFormats,
  tableVariants,
  tabsVariants,
  tagVariants,
  textAligns,
];

/** Every identifier of the contract: components, props (incl. item fields), functions, tokens. */
function contractIdentifiers(): Set<string> {
  const ids = new Set<string>();
  for (const api of CONTRACT_SOURCE.components) {
    ids.add(api.name);
    const docs = Object.entries(shapeOf(api.schema)).map(([name, s]) => propDoc(name, s));
    for (const name of fieldNames(docs)) ids.add(name);
    for (const p of componentProps(api)) for (const value of p.values) ids.add(value);
  }
  for (const fn of CONTRACT_SOURCE.functions) ids.add(fn.name);
  for (const list of TOKEN_LISTS) for (const token of list) ids.add(String(token));
  for (const name of iconNames) ids.add(name);
  return ids;
}

/**
 * Identifiers a rule names: words with an uppercase letter or a dot anywhere (component names,
 * camelCase props and functions, `gray.700`), and any word inside quotes or backticks (`"value"`,
 * `"4"`). Plain lowercase English words outside quotes ("value key", "rows") are prose.
 */
function namedIdentifiers(rule: string, ids: ReadonlySet<string>): string[] {
  const quoted = [...rule.matchAll(/["`]([^"`]*)["`]/g)].flatMap(
    (m) => m[1]?.split(/[^\w.]+/) ?? [],
  );
  const words = rule.split(/[^\w.]+/).filter((w) => /[A-Z.]/.test(w.replace(/\.$/, "")));
  return [...quoted, ...words.map((w) => w.replace(/\.$/, ""))].filter((w) => ids.has(w));
}

const text = (source: ContractSource) => buildInstructions(source);

describe("hand-written catalog rules [SV-C22]", () => {
  it("name no component, prop, token or function of the contract", () => {
    const ids = contractIdentifiers();
    expect(ids.size).toBeGreaterThan(300);
    for (const rule of HANDWRITTEN_RULES) expect(namedIdentifiers(rule, ids), rule).toEqual([]);
  });

  it("the detector catches names (self-test)", () => {
    const ids = contractIdentifiers();
    expect(
      namedIdentifiers('- Wrap Text in Box with "4" and gray.700 or formatDate.', ids),
    ).toEqual(["4", "Text", "Box", "gray.700", "formatDate"]);
  });
});

describe("no-questions rule in the system prompt [SV-C14]", () => {
  it("catalog.json instructions and the assembled system prompt order: never ask, assume, always produce the UI", () => {
    const rule = HANDWRITTEN_RULES.find((r) => r.includes("Never ask the user questions"));
    expect(rule).toMatch(/reasonable assumptions.*always reply with the complete UI/);
    expect(buildCatalogJson().instructions).toContain(rule);
    expect(assembleSystemPrompt(buildCatalogJson()).text).toContain(rule);
  });
});

describe("generated catalog rules and interactions [SV-C22]", () => {
  it("are what catalog.json ships as instructions", () => {
    expect(CATALOG_INSTRUCTIONS).toBe(buildInstructions(CONTRACT_SOURCE));
    expect(buildCatalogJson().instructions).toBe(CATALOG_INSTRUCTIONS);
    expect(CATALOG_INSTRUCTIONS).toContain("\n\nInteractions:\n");
    expect(buildInstructions(CONTRACT_SOURCE)).toBe(buildInstructions(CONTRACT_SOURCE));
  });

  it("list the current two-way props, triggers and local functions", () => {
    const interactions = interactionRules(CONTRACT_SOURCE).join("\n");
    for (const label of ["Input.value", "Modal.open", "Tabs.selectedIndex", "Modal.trigger"])
      expect(interactions).toContain(label);
    expect(interactions).toContain("(e.g. openUrl)");
  });

  it("follow a new component: its two-way prop, checks and style token appear", () => {
    expect(text(CONTRACT_SOURCE)).not.toContain("Slider");
    const interactions = interactionRules(withSlider).join("\n");
    expect(interactions).toContain("Tabs.selectedIndex, Slider.value)");
    expect(interactions).toContain("Checks (Button, Input, Checkbox, RadioGroup, Slider)");
    expect(catalogRules(withSlider).join("\n")).toContain(
      "checks on Button, Input, Checkbox, RadioGroup, Slider",
    );
    expect(catalogRules(withSlider).join("\n")).toContain(", Slider have no margin");
  });

  it("follow removed components and functions", () => {
    const source: ContractSource = {
      ...CONTRACT_SOURCE,
      components: CONTRACT_SOURCE.components.filter((api) => api.name !== "Modal"),
      functions: CONTRACT_SOURCE.functions.filter(
        (fn: FunctionApi) => fn.name !== "formatCurrency" && fn.name !== "openUrl",
      ),
    };
    const generated = text(source);
    expect(generated).not.toContain("Modal.trigger");
    expect(generated).not.toContain("Modal.open");
    expect(generated).not.toContain("formatCurrency");
    expect(generated).not.toContain("openUrl");
    expect(text(CONTRACT_SOURCE)).toContain("Use formatCurrency for money");
  });

  it("follow a re-kinded prop: a style prop turned into content leaves the style list", () => {
    const styleLine = (source: ContractSource) =>
      catalogRules(source).find((rule) => rule.startsWith("- Style props")) ?? "";
    expect(styleLine(CONTRACT_SOURCE)).toContain("boxSize");
    const Icon = CONTRACT_SOURCE.components.find((api) => api.name === "Icon");
    const shape = shapeOf(Icon?.schema);
    const reKinded = {
      name: "Icon",
      schema: z.object({
        ...shape,
        boxSize: prop.content(z.string().describe("Size.").optional()),
      }),
    } as unknown as ComponentApi;
    const source = {
      ...CONTRACT_SOURCE,
      components: CONTRACT_SOURCE.components.map((api) => (api.name === "Icon" ? reKinded : api)),
    };
    expect(styleLine(source)).not.toContain("boxSize");
  });
});

describe("status colour example [SV-C22]", () => {
  const statusLine = (source: ContractSource) =>
    catalogRules(source).find((rule) => rule.startsWith("- State colours")) ?? "";
  const pill = (values: readonly [string, ...string[]]) =>
    ({
      name: "Pill",
      schema: z.object({
        label: prop.content(z.string().describe("Text.")),
        colorScheme: prop.style("colorScheme", values, "Palette."),
      }),
    }) as unknown as ComponentApi;
  const withPill = (values: readonly [string, ...string[]]): ContractSource => ({
    ...CONTRACT_SOURCE,
    components: [...CONTRACT_SOURCE.components, pill(values)],
    roles: { ...CONTRACT_SOURCE.roles, Pill: "status" },
  });

  it("names every status component with colours its own enum accepts, derived from roles [A3-26]", () => {
    // From COMPONENT_ROLES and the contract (REMAP recipes 4, 5, 7 change both): no pinned list.
    for (const source of [CONTRACT_SOURCE, withPill(["teal", "purple"]), withPill(["green"])]) {
      const example = /\(e\.g\. ([^)]*)\)/.exec(statusLine(source))?.[1] ?? "";
      const shown = new Map(
        example.split("; ").map((entry) => {
          const [component, prop, ...rest] = entry.split(" ");
          return [`${component} ${prop}`, rest.join(" ").split(" / ")] as const;
        }),
      );
      const expected = source.components
        .filter((api) => source.roles[api.name] === "status")
        .flatMap((api) =>
          componentProps(api)
            .filter((p) => p.group === "colorScheme")
            .map((p) => [`${api.name} ${p.name}`, p.values] as const),
        );
      expect([...shown.keys()].toSorted()).toEqual(expected.map(([key]) => key).toSorted());
      for (const [key, values] of expected)
        for (const colour of shown.get(key) ?? []) expect(values, key).toContain(colour);
    }
  });

  it("names for each status component only colours it accepts (synthetic fixtures)", () => {
    expect(statusLine(withPill(["teal", "purple"]))).toContain("; Pill colorScheme teal / purple)");
    expect(statusLine(withPill(["green", "teal"]))).toContain("; Pill colorScheme green)");
  });
});
