import { keysOf, nonEmpty } from "./names.ts";

/** Source: src/foundations/borders.ts (widths only; the style is always solid) */
export const borderWidths = {
  "0": "0",
  "1px": "1px",
  "2px": "2px",
  "4px": "4px",
} as const;

export const borderWidthTokens = nonEmpty(keysOf(borderWidths));
