import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { StylePropsSchema } from "../style-props.ts";
import { maxGridColumns, sizeTokens } from "../tokens/index.ts";
import { layoutChildren } from "./layout.ts";

export const GridApi = {
  name: "Grid",
  schema: spec(
    z
      .object({
        ...StylePropsSchema.shape,
        children: layoutChildren(),
        columns: prop.option(
          z
            .number()
            .int()
            .min(1)
            .max(maxGridColumns)
            .describe(
              `Number of equal-width columns (1-${maxGridColumns}); children fill the cells row by row.`,
            )
            .optional(),
        ),
        minChildWidth: prop.style(
          "size",
          sizeTokens,
          "Minimum cell width. When set it replaces `columns`: the grid fits as many equal columns as the width allows, so cards collapse to one column on phones.",
        ),
      })
      .describe(
        "A grid of equal-width columns for cards, metrics and key/value pairs. Use `gap` for the gutter; prefer `minChildWidth` for card rows that must also fit a phone.",
      )
      .strict(),
    { mixins: ["ComponentCommon", StylePropsSchema] },
  ),
} satisfies ComponentApi;
