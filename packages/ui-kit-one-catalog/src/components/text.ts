import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";
import { ColorPropSchema } from "../style-props.ts";
import { fontSizeTokens, fontWeightTokens, textAligns } from "../tokens/index.ts";

export const TextApi = {
  name: "Text",
  schema: spec(
    z
      .object({
        ...ColorPropSchema.shape,
        text: commonRef(
          DynamicStringSchema,
          "DynamicString",
          "The text to display: a literal, a data-model binding, or a function call such as formatCurrency.",
        ),
        fontSize: z.enum(fontSizeTokens).describe("Font size token (md = 1rem).").optional(),
        fontWeight: z.enum(fontWeightTokens).describe("Font weight token.").optional(),
        textAlign: z.enum(textAligns).describe("Horizontal text alignment.").optional(),
        noOfLines: z
          .number()
          .int()
          .min(1)
          .describe("Truncates the text with an ellipsis after this many lines.")
          .optional(),
      })
      .describe("A paragraph of body text. Use Heading for titles.")
      .strict(),
    { mixins: ["ComponentCommon", ColorPropSchema] },
  ),
} satisfies ComponentApi;
