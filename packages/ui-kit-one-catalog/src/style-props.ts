import { specDef } from "@a2ui/web_core/catalog";
import { z } from "zod";
import {
  borderWidthTokens,
  colorTokens,
  radiusTokens,
  shadowTokens,
  sizeTokens,
  spaceTokens,
  textAligns,
} from "./tokens/index.ts";

const space = (what: string) =>
  z.enum(spaceTokens).describe(`${what} — a space token (e.g. "4" = 1rem).`).optional();

/**
 * Shared styling props of the layout components. Token values only: there is no `sx`, raw CSS or
 * responsive syntax (see the styling policy in CONTRACTS.md).
 */
const stylePropsShape = {
  p: space("Padding on all sides"),
  px: space("Horizontal padding"),
  py: space("Vertical padding"),
  m: space("Margin on all sides"),
  mx: space("Horizontal margin"),
  my: space("Vertical margin"),
  gap: space("Gap between children"),
  bg: z.enum(colorTokens).describe('Background color token (e.g. "gray.700").').optional(),
  color: z.enum(colorTokens).describe("Text color token inherited by the children.").optional(),
  borderRadius: z.enum(radiusTokens).describe("Corner radius token.").optional(),
  borderWidth: z.enum(borderWidthTokens).describe("Solid border width on all sides.").optional(),
  borderColor: z.enum(colorTokens).describe("Border color token; needs `borderWidth`.").optional(),
  shadow: z.enum(shadowTokens).describe("Box shadow token.").optional(),
  w: z.enum(sizeTokens).describe('Width token ("full" = 100% of the parent).').optional(),
  maxW: z
    .enum(sizeTokens)
    .describe('Maximum width token ("container.md" etc. for page columns).')
    .optional(),
  minH: z.enum(sizeTokens).describe("Minimum height token.").optional(),
  textAlign: z.enum(textAligns).describe("Horizontal alignment of inline content.").optional(),
};

export const StylePropsSchema = specDef("StyleProps", z.object(stylePropsShape));

export const STYLE_PROP_NAMES = Object.keys(stylePropsShape) as Array<keyof typeof stylePropsShape>;

/** The `color` prop of Text, Heading and Icon, declared once in the catalog's `$defs`. */
export const ColorPropSchema = specDef(
  "ColorProp",
  z.object({
    color: z
      .enum(colorTokens)
      .describe(
        'Text or icon color token (e.g. "gray.400"); omit it to inherit the current text color.',
      )
      .optional(),
  }),
);
