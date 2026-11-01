import { describe, expect, it } from "vite-plus/test";
import { systemPromptText } from "../scripts/artifacts.ts";
import { readExamples } from "../scripts/examples.ts";
import { buildCatalogJson } from "../src/index.ts";
import { PROMPT_EXAMPLE_IDS, assembleSystemPrompt, orderForPrompt } from "../src/prompt/index.ts";

const idOf = (example: { file: string }) => example.file.replace(/^compositions\/|\.json$/g, "");
const compositions = readExamples("compositions");
const defaults = orderForPrompt(compositions, idOf).slice(0, PROMPT_EXAMPLE_IDS.length);

/**
 * CF-I2 / P5-D1: the default set was chosen by measurement (GLM, default 9 vs lean 5 examples;
 * docs/server/EXPERIMENT.md §15). Changing it needs a new measurement first.
 */
const MEASURED_PROMPT_EXAMPLE_IDS = [
  "01-login",
  "02-signup",
  "03-settings",
  "04-user-list",
  "05-data-table",
  "21-order-statuses",
  "22-payment-history",
  "23-transfer-confirm-modal",
  "24-task-checklist",
];

describe("default prompt examples (CF) [INT-03]", () => {
  it("stay the set measured in P5-D1 until re-measured [CF-I2]", () => {
    expect([...PROMPT_EXAMPLE_IDS]).toEqual(MEASURED_PROMPT_EXAMPLE_IDS);
  });

  it("are existing compositions, in PROMPT_EXAMPLE_IDS order, then the rest", () => {
    expect(defaults.map(idOf)).toEqual([...PROMPT_EXAMPLE_IDS]);
    expect(orderForPrompt(compositions, idOf)).toHaveLength(compositions.length);
  });

  it("teach the EXPERIMENT §9 patterns: explicit status rows, one template object, Modal trigger, per-item state [EX-21..24]", () => {
    const text = (id: string) => JSON.stringify(defaults.find((e) => idOf(e) === id)?.messages);
    expect(text("21-order-statuses")).toMatch(
      /"component":"Tag".*"colorScheme":"green".*"colorScheme":"orange".*"colorScheme":"red"/,
    );
    expect(text("22-payment-history")).toContain(
      '"children":{"componentId":"payment","path":"/payments"}',
    );
    expect(text("23-transfer-confirm-modal")).toContain('"trigger":"open-confirm"');
    expect(text("24-task-checklist")).toContain('"value":{"path":"done"}');
  });

  it("build a byte-stable prompt with no timestamps or ids before the static parts", () => {
    const build = () => assembleSystemPrompt(buildCatalogJson(), { examples: defaults }).text;
    const text = build();
    expect(build()).toBe(text);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    for (const example of defaults)
      expect(text).toContain(JSON.stringify(example.messages, null, 2));
  });

  it("are what build-prompt.ts writes to dist/system-prompt.md by default", () => {
    expect(systemPromptText().text).toBe(
      `${assembleSystemPrompt(buildCatalogJson(), { examples: defaults }).text}\n`,
    );
  });
});
