import { keysOf, nonEmpty } from "./names.ts";

/** Source: src/foundations/typography.ts → fontSizes (7xl and up are not exposed) */
export const fontSizes = {
  xs: "0.75rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
  "6xl": "3.75rem",
} as const;

/** Source: src/foundations/typography.ts → fontWeights (subset) */
export const fontWeights = {
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const fontSizeTokens = nonEmpty(keysOf(fontSizes));
export const fontWeightTokens = nonEmpty(keysOf(fontWeights));
