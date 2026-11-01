import { createBasicCatalogFunctions } from "@a2ui/web_core/v0_9/basic_catalog";
import { describe, expect, it } from "vite-plus/test";
import { formatting } from "../src/index.ts";

const functions = createBasicCatalogFunctions({ locale: formatting.locale });
const execute = (name: string, args: Record<string, unknown>) =>
  functions.find((fn) => fn.name === name)?.execute(args, undefined as never);

describe("basic functions with the contract locale (ru-RU, RUB) [INT-01]", () => {
  it("formats currency in rubles", () => {
    expect(execute("formatCurrency", { value: 1500.5, currency: formatting.currency })).toBe(
      "1 500,50 ₽",
    );
  });

  it("formats dates with the recommended dd.MM.yyyy pattern", () => {
    expect(execute("formatDate", { value: "2026-10-24", format: "dd.MM.yyyy" })).toBe("24.10.2026");
  });

  it("pluralizes by Russian plural categories", () => {
    const forms = { one: "операция", few: "операции", many: "операций", other: "операции" };
    expect([1, 3, 5, 21].map((value) => execute("pluralize", { value, ...forms }))).toEqual([
      "операция",
      "операции",
      "операций",
      "операция",
    ]);
  });
});
