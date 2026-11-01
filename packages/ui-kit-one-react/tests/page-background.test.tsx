import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_COLOR_MODE, PAGE_BACKGROUND } from "../src/index.ts";
import { KIT_THEME } from "../src/provider.tsx";

/** A theme colour token (`gray.800`) looked up in `colors`. */
const lookup = (colors: Readonly<Record<string, unknown>>, token: string): unknown =>
  token
    .split(".")
    .reduce<unknown>(
      (at, key) =>
        typeof at === "object" && at !== null ? (at as Record<string, unknown>)[key] : undefined,
      colors,
    );

describe("one page background value [PG-29]", () => {
  // Read from the provider's own theme (stock: gray.800; an owner theme: its own token), never a hardcoded one.
  it("is the theme's own dark-mode body background, resolved to a CSS colour", () => {
    const global = KIT_THEME.styles.global as (p: object) => { body: { bg: string } };
    const { bg } = global({ colorMode: DEFAULT_COLOR_MODE, theme: KIT_THEME }).body;
    expect(PAGE_BACKGROUND).toBe(lookup(KIT_THEME.colors, bg));
    expect(PAGE_BACKGROUND).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
