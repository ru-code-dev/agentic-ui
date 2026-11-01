/**
 * A6-02: the kit's check and format functions are total for what an untouched or cleared form field
 * holds (ported from the reviewer's attack/a6/function-totality.mjs). A check fails instead of
 * throwing; a format gives ""; a wrong non-value argument (the agent's mistake) still throws.
 */
import { DataContext, DataModel } from "@a2ui/web_core/v0_9";
import { describe, expect, it } from "vite-plus/test";
import { uiKitOneCatalog } from "../src/index.ts";

const context = new DataContext(new DataModel({}), "/");
const call = (name: string, args: Record<string, unknown>) =>
  uiKitOneCatalog.invoker(name, args, context);

const checks: Record<string, (value: unknown) => Record<string, unknown>> = {
  required: (value) => ({ value }),
  regex: (value) => ({ value, pattern: "^\\d+$" }),
  length: (value) => ({ value, min: 1 }),
  numeric: (value) => ({ value, min: 1 }),
  email: (value) => ({ value }),
};
const formats: Record<string, (value: unknown) => Record<string, unknown>> = {
  formatCurrency: (value) => ({ value, currency: "RUB" }),
  formatNumber: (value) => ({ value }),
  formatDate: (value) => ({ value, format: "dd.MM.yyyy" }),
  pluralize: (value) => ({ value, one: "рубль", other: "рублей" }),
};

describe("[A6-02] check and format functions are total for empty form values", () => {
  it("[A6-02] every check fails (false) for an absent, null or empty value instead of throwing", () => {
    for (const [name, args] of Object.entries(checks)) {
      for (const value of [undefined, null, ""]) {
        expect(call(name, args(value)), `${name}(${JSON.stringify(value)})`).toBe(false);
      }
    }
  });

  it("[A6-02] a wrong-typed value fails the check; a filled valid value passes", () => {
    expect(call("numeric", { value: "abc", min: 1 })).toBe(false);
    expect(call("regex", { value: 42, pattern: "^\\d+$" })).toBe(false);
    expect(call("numeric", { value: 500, min: 1, max: 600000 })).toBe(true);
    expect(call("numeric", { value: 0, min: 1 })).toBe(false);
    expect(call("required", { value: "+79991234567" })).toBe(true);
    expect(call("regex", { value: "123", pattern: "^\\d+$" })).toBe(true);
    expect(call("length", { value: "ab", min: 1 })).toBe(true);
    expect(call("email", { value: "anna@example.ru" })).toBe(true);
  });

  it("[A6-02] every format gives an empty string for an absent, null or empty value", () => {
    for (const [name, args] of Object.entries(formats)) {
      for (const value of [undefined, null, ""]) {
        expect(call(name, args(value)), `${name}(${JSON.stringify(value)})`).toBe("");
      }
    }
    expect(call("formatCurrency", { value: 1500, currency: "RUB" })).toMatch(/1\s500/);
  });

  it("[A6-02] a wrong argument other than the value still throws (the agent's mistake gets its repair)", () => {
    expect(() => call("numeric", { value: 5, min: "1" })).toThrow(
      /Validation failed for function 'numeric'/,
    );
    expect(() => call("regex", { value: "x" })).toThrow(/Validation failed for function 'regex'/);
    expect(() => call("formatCurrency", { value: 5 })).toThrow(/formatCurrency/);
  });
});
