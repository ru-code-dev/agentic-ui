import { keysOf, nonEmpty } from "./names.ts";

/** Source: src/foundations/sizes.ts — named widths for `w`, `maxW` and `minH` (container.* for page columns) */
export const sizes = {
  full: "100%",
  "3xs": "14rem",
  "2xs": "16rem",
  xs: "20rem",
  sm: "24rem",
  md: "28rem",
  lg: "32rem",
  xl: "36rem",
  "2xl": "42rem",
  "3xl": "48rem",
  "4xl": "56rem",
  "5xl": "64rem",
  "6xl": "72rem",
  /** Source: src/foundations/sizes.ts → container (page column widths) */
  "container.sm": "640px",
  "container.md": "768px",
  "container.lg": "1024px",
  "container.xl": "1280px",
} as const;

export const sizeTokens = nonEmpty(keysOf(sizes));
