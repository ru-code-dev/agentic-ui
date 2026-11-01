import { describe, expect, it } from "vite-plus/test";
import type { Progress } from "@agentic-ui/a2ui-react/core";
import { elapsedLabel, errorsLabel, progressLine } from "./progress-text.ts";

const progress = (over: Partial<Progress>): Progress => ({
  chatId: "c",
  state: "running",
  attempt: 1,
  maxAttempts: 4,
  errors: [],
  errorCount: 0,
  elapsedMs: 0,
  ...over,
});

describe("working message texts [SV-C20]", () => {
  it("names the failed attempt, its error count and the repair in progress", () => {
    expect(progressLine(progress({ state: "repairing", attempt: 2, errorCount: 3 }))).toBe(
      "Попытка 1 не прошла проверку: 3 ошибки, исправляю (2 из 4)",
    );
    expect(progressLine(progress({ state: "repairing", attempt: 3, errorCount: 1 }))).toBe(
      "Попытка 2 не прошла проверку: 1 ошибка, исправляю (3 из 4)",
    );
  });

  it("adds nothing without progress, on the first attempt or when finished", () => {
    expect(progressLine(undefined)).toBeUndefined();
    expect(progressLine(progress({}))).toBeUndefined();
    expect(progressLine(progress({ state: "done", attempt: 2 }))).toBeUndefined();
  });

  it("uses Russian plurals and a compact timer", () => {
    expect([1, 2, 5, 11, 21, 22, 25, 112].map(errorsLabel)).toEqual([
      "1 ошибка",
      "2 ошибки",
      "5 ошибок",
      "11 ошибок",
      "21 ошибка",
      "22 ошибки",
      "25 ошибок",
      "112 ошибок",
    ]);
    expect([0, 8_900, 65_000].map(elapsedLabel)).toEqual(["0 с", "8 с", "1 мин 05 с"]);
  });
});
