import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildCatalogJson } from "../src/index.ts";
import {
  PROMPT_EXAMPLE_IDS,
  approxTokens,
  assembleSystemPrompt,
  type PromptFormat,
} from "../src/prompt/index.ts";
import { systemPromptText } from "./artifacts.ts";

const FORMATS: readonly PromptFormat[] = ["direct-json", "express"];

const { values } = parseArgs({
  options: {
    examples: { type: "string", default: String(PROMPT_EXAMPLE_IDS.length) },
    format: { type: "string", default: "direct-json" },
  },
});
const count = Number(values.examples);
if (!Number.isInteger(count) || count < 0) {
  throw new Error(`--examples must be a non-negative integer, got '${values.examples}'`);
}
const format = FORMATS.find((candidate) => candidate === values.format);
if (format === undefined) throw new Error(`--format must be one of ${FORMATS.join(", ")}`);

const { examples, text } = systemPromptText(count, format);

const outDir = new URL("../dist/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("system-prompt.md", outDir), text);
console.log(
  `wrote dist/system-prompt.md (${format}, ${examples.length} examples, ~${approxTokens(text)} tokens)`,
);
for (const section of assembleSystemPrompt(buildCatalogJson(), { format, examples }).sections)
  console.log(`  ${section.title}: ~${approxTokens(section.text)} tokens`);
