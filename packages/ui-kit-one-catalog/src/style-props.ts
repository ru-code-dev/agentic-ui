import { specDef } from "@a2ui/web_core/catalog";
import { z } from "zod";
import { prop } from "./prop-kinds.ts";
import {
  borderWidthTokens,
  colorTokens,
  radiusTokens,
  shadowTokens,
  sizeTokens,
  spaceTokens,
  textAligns,
} from "./tokens/index.ts";

const space = (what: string) => prop.style("space", spaceTokens, `${what} (e.g. "4" = 1rem).`);

/**
 * Shared styling props of the layout components. Token values only: there is no `sx`, raw CSS or
 * responsive syntax, and no data binding (SV-C21; styling policy in CONTRACTS.md).
 */
const stylePropsShape = {
  p: space("Padding on all sides"),
  px: space("Horizontal padding"),
  py: space("Vertical padding"),
  m: space("Margin on all sides"),
  mx: space("Horizontal margin"),
  my: space("Vertical margin"),
  gap: space("Gap between children"),
  bg: prop.style("color", colorTokens, 'Background color (e.g. "gray.700").'),
  color: prop.style("color", colorTokens, "Text color inherited by the children."),
  borderRadius: prop.style("radius", radiusTokens, "Corner radius."),
  borderWidth: prop.style("border", borderWidthTokens, "Solid border width on all sides."),
  borderColor: prop.style("color", colorTokens, "Border color; needs `borderWidth`."),
  shadow: prop.style("shadow", shadowTokens, "Box shadow."),
  w: prop.style("size", sizeTokens, 'Width ("full" = 100% of the parent).'),
  maxW: prop.style("size", sizeTokens, 'Maximum width ("container.md" etc. for page columns).'),
  minH: prop.style("size", sizeTokens, "Minimum height."),
  textAlign: prop.style("typography", textAligns, "Horizontal alignment of inline content."),
};

export const StylePropsSchema = specDef("StyleProps", z.object(stylePropsShape));

export const STYLE_PROP_NAMES = Object.keys(stylePropsShape) as Array<keyof typeof stylePropsShape>;

/** The `color` prop of Text, Heading and Icon, declared once in the catalog's `$defs`. */
export const ColorPropSchema = specDef(
  "ColorProp",
  z.object({
    color: prop.style(
      "color",
      colorTokens,
      'Text or icon color (e.g. "gray.400"); omit it to inherit the current text color.',
    ),
  }),
);
