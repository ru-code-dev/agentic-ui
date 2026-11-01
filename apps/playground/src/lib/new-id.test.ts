import { describe, expect, it } from "vite-plus/test";
import { newId, type RandomSource } from "./new-id.ts";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId [A4-13]", () => {
  it("uses getRandomValues when randomUUID is missing (a non-secure context)", () => {
    const insecure: RandomSource = { getRandomValues: (array) => crypto.getRandomValues(array) };
    const ids = new Set(Array.from({ length: 200 }, () => newId(insecure)));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it("formats fixed bytes as a v4 uuid", () => {
    expect(newId({ getRandomValues: (array) => array })).toBe(
      "00000000-0000-4000-8000-000000000000",
    );
  });

  it("prefers randomUUID where the context has it", () => {
    const secure: RandomSource = {
      getRandomValues: () => {
        throw new Error("unused");
      },
      randomUUID: () => "secure-id",
    };
    expect(newId(secure)).toBe("secure-id");
  });
});
