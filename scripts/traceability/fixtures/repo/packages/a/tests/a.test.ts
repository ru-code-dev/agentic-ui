import { describe, expect, it } from "vitest";

describe("sidebar [PG-01]", () => {
  it("ignores brackets in code and comments", () => {
    // [PG-99] in a comment is not a tag
    expect(/"[A-Z]{3}"/.test("x")).toBe(false);
    expect(/[A-Z0-9]-x/.test("A-x")).toBe(true);
  });
});
