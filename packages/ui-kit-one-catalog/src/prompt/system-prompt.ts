import {
  ComponentPruningTransformer,
  DirectJsonPromptGenerator,
  ExpressPromptGenerator,
  InMemoryCatalogProvider,
  type AgentToRendererMessage,
} from "@a2ui/agent";
import { CATALOG_ID } from "../catalog-id.ts";
import { PROTOCOL_VERSION } from "../catalog.ts";

/** Inference formats of `@a2ui/agent`: JSON in `<a2ui-json>` blocks, or the compact Express DSL. */
export type PromptFormat = "direct-json" | "express";

export interface PromptExample {
  readonly name: string;
  readonly messages: readonly unknown[];
}

export interface PromptOptions {
  readonly format?: PromptFormat;
  /** Few-shot examples, in order. */
  readonly examples?: readonly PromptExample[];
  /** Components the agent may use (A2UI ComponentPruningTransformer); all when omitted. */
  readonly components?: readonly string[];
  /** Host instructions placed before the A2UI part (persona, task, tone). */
  readonly instructions?: string;
}

export type PromptSectionId =
  | "instructions"
  | "base-rules"
  | "envelope"
  | "common-types"
  | "catalog-rules"
  | "components"
  | "functions"
  | "defs"
  | "examples";

export interface PromptSection {
  readonly id: PromptSectionId;
  readonly title: string;
  readonly text: string;
}

export interface SystemPrompt {
  readonly text: string;
  /** Consecutive slices of `text`, in order; their texts concatenate to `text`. */
  readonly sections: readonly PromptSection[];
  /** The catalog document the agent sees (after pruning). */
  readonly catalog: Record<string, unknown>;
}

export const PROMPT_SECTION_TITLES: Readonly<Record<PromptSectionId, string>> = {
  instructions: "Custom instructions",
  "base-rules": "Response contract and base rules",
  envelope: "Message envelope schema",
  "common-types": "Common types",
  "catalog-rules": "Catalog rules",
  components: "Catalog components",
  functions: "Functions",
  defs: "Catalog $defs",
  examples: "Few-shot examples",
};

type Marker = readonly [PromptSectionId, string | undefined];

/** Splits `text` at the first occurrence of each marker; every slice runs to the next marker. */
function splitSections(text: string, markers: readonly Marker[]): PromptSection[] {
  const starts = markers
    .map(
      ([id, marker]) =>
        [id, marker === undefined || marker === "" ? -1 : text.indexOf(marker)] as const,
    )
    .filter(([, index]) => index >= 0)
    .toSorted((a, b) => a[1] - b[1]);
  return starts.map(([id, start], index) => ({
    id,
    title: PROMPT_SECTION_TITLES[id],
    text: text.slice(index === 0 ? 0 : start, starts[index + 1]?.[1] ?? text.length),
  }));
}

/**
 * Assembles the agent system prompt for ui-kit-one from the catalog document (`catalog.json`) with
 * `@a2ui/agent`'s prompt generators, and splits it into measurable sections. Shared by the
 * `catalog:prompt` script and the playground's LLM context page.
 */
export function assembleSystemPrompt(
  catalogJson: Record<string, unknown>,
  options: PromptOptions = {},
): SystemPrompt {
  const { format = "direct-json", examples = [], components, instructions = "" } = options;
  const loaded = new InMemoryCatalogProvider(catalogJson, PROTOCOL_VERSION, CATALOG_ID).load();
  const catalog =
    components === undefined
      ? loaded
      : new ComponentPruningTransformer([...components]).transform(loaded);
  const document = catalog.toJson();
  const turns = examples.map((example) => example.messages as unknown as AgentToRendererMessage[]);

  let snippet: string;
  let markers: Marker[];
  if (format === "direct-json") {
    const generator = new DirectJsonPromptGenerator([catalog], turns);
    snippet = generator.generate();
    markers = [
      ["base-rules", "## Workflow Description:"],
      ["envelope", "---BEGIN A2UI JSON SCHEMA---"],
      ["common-types", "### Common Types Schema:"],
      ["catalog-rules", "### Catalog Schema:"],
      ["components", `"components":${JSON.stringify(document.components)}`],
      ["functions", `"functions":${JSON.stringify(document.functions)}`],
      ["defs", `"$defs":${JSON.stringify(document.$defs)}`],
      ["examples", "### Examples:"],
    ];
  } else {
    const generator = new ExpressPromptGenerator(
      [catalog],
      turns.length > 0 ? { [CATALOG_ID]: turns } : undefined,
    );
    snippet = generator.generate();
    markers = [
      ["base-rules", generator.generateBaseRules().slice(0, 64)],
      ["components", "## Positional Component Signatures"],
      ["functions", "## Positional Function Signatures"],
      ["catalog-rules", "## Catalog Instructions"],
      ["examples", generator.generateExamples()],
    ];
  }

  const text = instructions.trim() === "" ? snippet : `${instructions.trim()}\n\n${snippet}`;
  const sections = splitSections(text, [
    ["instructions", instructions.trim() === "" ? undefined : text.slice(0, 1)],
    ...markers,
  ]);
  return { text, sections, catalog: document };
}

/** Rough token estimate (4 characters per token); exact tokenizers live in the playground. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
