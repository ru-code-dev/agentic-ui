import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
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
        columns: z
          .number()
          .int()
          .min(1)
          .max(maxGridColumns)
          .describe(
            `Number of equal-width columns (1-${maxGridColumns}); children fill the cells row by row.`,
          )
          .optional(),
        minChildWidth: z
          .enum(sizeTokens)
          .describe(
            "Minimum cell width (size token). When set it replaces `columns`: the grid fits as many equal columns as the width allows, so cards collapse to one column on phones.",
          )
          .optional(),
      })
      .describe(
        "A grid of equal-width columns for cards, metrics and key/value pairs. Use `gap` for the gutter; prefer `minChildWidth` for card rows that must also fit a phone.",
      )
      .strict(),
    { mixins: ["ComponentCommon", StylePropsSchema] },
  ),
} satisfies ComponentApi;
