import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildCatalogJson } from "../src/index.ts";
import { approxTokens, assembleSystemPrompt, type PromptFormat } from "../src/prompt/index.ts";
import { readExamples } from "./examples.ts";

const FORMATS: readonly PromptFormat[] = ["direct-json", "express"];

const { values } = parseArgs({
  options: {
    examples: { type: "string", default: "5" },
    format: { type: "string", default: "direct-json" },
  },
});
const count = Number(values.examples);
if (!Number.isInteger(count) || count < 0) {
  throw new Error(`--examples must be a non-negative integer, got '${values.examples}'`);
}
const format = FORMATS.find((candidate) => candidate === values.format);
if (format === undefined) throw new Error(`--format must be one of ${FORMATS.join(", ")}`);

const examples = [...readExamples("compositions"), ...readExamples("components")].slice(0, count);
const prompt = assembleSystemPrompt(buildCatalogJson(), { format, examples });

const outDir = new URL("../dist/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("system-prompt.md", outDir), `${prompt.text}\n`);
console.log(
  `wrote dist/system-prompt.md (${format}, ${examples.length} examples, ~${approxTokens(prompt.text)} tokens)`,
);
for (const section of prompt.sections)
  console.log(`  ${section.title}: ~${approxTokens(section.text)} tokens`);
