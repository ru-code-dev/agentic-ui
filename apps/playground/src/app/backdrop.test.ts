import { PAGE_BACKGROUND } from "@agentic-ui/ui-kit-one-react";
import { describe, expect, it } from "vite-plus/test";
import { BACKDROP_VAR, backdropStyle } from "./backdrop.ts";

const sources = import.meta.glob<string>(["../**/*.{ts,tsx,css}", "!../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("preview backdrop [PG-29]", () => {
  it("is the kit's page background, set once as a CSS variable", () => {
    expect((backdropStyle as Record<string, string>)[BACKDROP_VAR]).toBe(PAGE_BACKGROUND);
  });

  it("is never hardcoded in the playground (no #1a202c or gray.800 copies)", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    const copies = Object.entries(sources)
      .filter(([, text]) => /#1a202c|gray\.800/i.test(text))
      .map(([path]) => path);
    expect(copies).toEqual([]);
  });
});
