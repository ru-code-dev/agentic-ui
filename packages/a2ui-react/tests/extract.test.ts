// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";
import { extractA2UI } from "../src/core/index.ts";
import { surface } from "./support/scripted.ts";

describe("extractA2UI [SV-C26]", () => {
  it("[SV-C26] splits a model reply into its text and the messages of its <a2ui-json> block", () => {
    const messages = surface("s1", "Привет");
    const reply = `Вот интерфейс.\n<a2ui-json>${JSON.stringify(messages)}</a2ui-json>\nГотово.`;
    const extraction = extractA2UI(reply);
    expect(extraction.messages).toEqual(messages);
    expect(extraction.errors).toEqual([]);
    expect(extraction.text).toContain("Вот интерфейс.");
    expect(extraction.text).toContain("Готово.");
  });

  it("[SV-C27] a text-only reply has no messages and no errors; an unreadable block is an error", () => {
    expect(extractA2UI("Просто ответ.")).toEqual({
      text: "Просто ответ.",
      messages: [],
      errors: [],
    });
    const broken = extractA2UI("x <a2ui-json>{not json</a2ui-json>");
    expect(broken.messages).toEqual([]);
    expect(broken.errors).toHaveLength(1);
  });
});
