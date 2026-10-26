// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import o200k from "js-tiktoken/ranks/o200k_base";
import { describe, expect, it } from "vite-plus/test";
import { approxCounter, createO200kCounter, createQwenCounter } from "./tokenizers.ts";

const vendored = join(dirname(fileURLToPath(import.meta.url)), "../../public/tokenizers/qwen2.5");
const readJson = (file: string) => JSON.parse(readFileSync(join(vendored, file), "utf8")) as object;

/** Reference counts from the Rust implementations (npm `tokenizers` 0.23.2, `tiktoken` 1.0.22). */
const REFERENCES = [
  { text: "Hello, world!", qwen: 4, o200k: 4 },
  { text: "Перевод 15 000 ₽ будет зачислен в течение минуты.", qwen: 21, o200k: 16 },
  {
    text: '{"version":"v0.9","createSurface":{"surfaceId":"login","catalogId":"urn:agentic-ui:catalog:ui-kit-one:v1"}}',
    qwen: 33,
    o200k: 33,
  },
  {
    text: '<a2ui-json>[{"id":"root","component":"Text","text":"Привет"}]</a2ui-json>',
    qwen: 26,
    o200k: 25,
  },
  { text: "function add(a, b) {\n  return a + b;\n}\n", qwen: 14, o200k: 14 },
];

describe("tokenizers (PG-26)", () => {
  const qwen = createQwenCounter(readJson("tokenizer.json"), readJson("tokenizer_config.json"));
  const openai = createO200kCounter(o200k);

  it.each(REFERENCES)("counts Qwen tokens exactly: $text", ({ text, qwen: expected }) => {
    expect(qwen.count(text)).toBe(expected);
  });

  it.each(REFERENCES)("counts o200k tokens exactly: $text", ({ text, o200k: expected }) => {
    expect(openai.count(text)).toBe(expected);
  });

  it("approximates with four characters per token", () => {
    expect(approxCounter.count("12345678")).toBe(2);
    expect(approxCounter.count("123456789")).toBe(3);
  });
});
