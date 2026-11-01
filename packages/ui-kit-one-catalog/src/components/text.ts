import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { ColorPropSchema } from "../style-props.ts";
import { fontSizeTokens, fontWeightTokens, textAligns } from "../tokens/index.ts";

export const TextApi = {
  name: "Text",
  schema: spec(
    z
      .object({
        ...ColorPropSchema.shape,
        text: prop.content(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "The text to display: a literal, a data-model binding, or a function call such as formatCurrency.",
          ),
        ),
        fontSize: prop.style("typography", fontSizeTokens, "Font size (md = 1rem)."),
        fontWeight: prop.style("typography", fontWeightTokens, "Font weight."),
        textAlign: prop.style("typography", textAligns, "Horizontal text alignment."),
        noOfLines: prop.option(
          z
            .number()
            .int()
            .min(1)
            .describe("Truncates the text with an ellipsis after this many lines.")
            .optional(),
        ),
      })
      .describe(
        "A paragraph of body text. Use Heading for titles. It has no margin, padding or size props: wrap it in a layout component for spacing.",
      )
      .strict(),
    { mixins: ["ComponentCommon", ColorPropSchema] },
  ),
} satisfies ComponentApi;
