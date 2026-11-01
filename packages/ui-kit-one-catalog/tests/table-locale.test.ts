import { validatePayload } from "@a2ui/agent";
import { describe, expect, it } from "vite-plus/test";
import { CATALOG_ID, uiKitOneContract } from "../src/index.ts";

const table = (locale: string) => [
  { version: "v0.9", createSurface: { surfaceId: "t", catalogId: CATALOG_ID } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "t",
      components: [
        {
          id: "root",
          component: "Table",
          rows: { path: "/rows" },
          columns: [{ header: "Сумма", key: "amount", format: "number" }],
          locale,
        },
      ],
    },
  },
];

describe("Table locale is a BCP 47 tag [A3-13]", () => {
  it("accepts language tags Intl understands", () => {
    for (const locale of ["ru-RU", "en", "de-CH", "zh-Hant-TW", "sr-Latn-RS"]) {
      expect(() => new Intl.NumberFormat(locale)).not.toThrow();
      expect(() => validatePayload([uiKitOneContract], table(locale)), locale).not.toThrow();
    }
  });

  it("refuses the underscore form an LLM writes (ru_RU), which Intl rejects while rendering", () => {
    for (const locale of ["ru_RU", "en_US", "", "ru RU", "1234"]) {
      expect(() => validatePayload([uiKitOneContract], table(locale)), locale).toThrow();
    }
    expect(() => new Intl.NumberFormat("ru_RU")).toThrow(RangeError);
  });
});
