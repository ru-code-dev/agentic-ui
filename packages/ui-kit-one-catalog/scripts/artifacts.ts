import { buildCatalogJson } from "../src/index.ts";
import {
  PROMPT_EXAMPLE_IDS,
  assembleSystemPrompt,
  orderForPrompt,
  type PromptFormat,
} from "../src/prompt/index.ts";
import { renderContractsMarkdown } from "./contracts-markdown.ts";
import { readExamples } from "./examples.ts";

/** `dist/catalog.json` text. */
export const catalogJsonText = () => `${JSON.stringify(buildCatalogJson(), null, 2)}\n`;

/** Few-shot examples in prompt order (prompt-ordered compositions, then component snippets). */
export function promptExamples(count: number = PROMPT_EXAMPLE_IDS.length) {
  const compositions = orderForPrompt(readExamples("compositions"), (example) =>
    example.file.replace(/^compositions\/|\.json$/g, ""),
  );
  return [...compositions, ...readExamples("components")].slice(0, count);
}

/** `dist/system-prompt.md` text for `count` examples in `format`. */
export function systemPromptText(count?: number, format: PromptFormat = "direct-json") {
  const examples = promptExamples(count);
  return {
    examples,
    text: `${assembleSystemPrompt(buildCatalogJson(), { format, examples }).text}\n`,
  };
}

/** Every generated artifact of this package with its default content (package-relative paths). */
export function catalogArtifacts(): Record<string, string> {
  return {
    "dist/catalog.json": catalogJsonText(),
    "dist/system-prompt.md": systemPromptText().text,
    "CONTRACTS.md": renderContractsMarkdown(),
  };
}
