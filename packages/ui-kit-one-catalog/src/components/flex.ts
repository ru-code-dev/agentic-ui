import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { StylePropsSchema } from "../style-props.ts";
import { directions, flexAligns, flexJustifies, flexWraps } from "../tokens/index.ts";
import { layoutChildren } from "./layout.ts";

export const FlexApi = {
  name: "Flex",
  schema: spec(
    z
      .object({
        ...StylePropsSchema.shape,
        children: layoutChildren(),
        direction: prop.option(
          z
            .enum(directions)
            .describe("Main axis: 'row' places children side by side, 'column' stacks them.")
            .optional(),
        ),
        align: prop.option(
          z.enum(flexAligns).describe("Alignment of the children across the main axis.").optional(),
        ),
        justify: prop.option(
          z
            .enum(flexJustifies)
            .describe(
              "Distribution of the children along the main axis; 'space-between' pushes them to both ends.",
            )
            .optional(),
        ),
        wrap: prop.option(
          z
            .enum(flexWraps)
            .describe("'wrap' lets children wrap onto new lines when they do not fit.")
            .optional(),
        ),
      })
      .describe("A flexbox row or column. Use `gap` for spacing between the children.")
      .strict(),
    { mixins: ["ComponentCommon", StylePropsSchema] },
  ),
} satisfies ComponentApi;
