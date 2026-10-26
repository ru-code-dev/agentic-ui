import { afterEach, beforeEach, expect, vi, type MockInstance } from "vite-plus/test";

/** Fails the test when anything is logged through console.error or console.warn. */
export function failOnConsoleNoise(): void {
  let error: MockInstance;
  let warn: MockInstance;
  beforeEach(() => {
    error = vi.spyOn(console, "error");
    warn = vi.spyOn(console, "warn");
  });
  afterEach(() => {
    expect(error.mock.calls).toEqual([]);
    expect(warn.mock.calls).toEqual([]);
    error.mockRestore();
    warn.mockRestore();
  });
}
