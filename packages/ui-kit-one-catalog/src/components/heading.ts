import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";
import { ColorPropSchema } from "../style-props.ts";
import { headingElements, headingSizes, textAligns } from "../tokens/index.ts";

export const HeadingApi = {
  name: "Heading",
  schema: spec(
    z
      .object({
        ...ColorPropSchema.shape,
        text: commonRef(DynamicStringSchema, "DynamicString", "The heading text."),
        as: z
          .enum(headingElements)
          .describe("Element and outline level (h1 = page title); independent of the visual size.")
          .optional(),
        size: z
          .enum(headingSizes)
          .describe(
            "Visual size; 'md' and smaller suit card titles, 'xl' and larger suit page titles.",
          )
          .optional(),
        textAlign: z.enum(textAligns).describe("Horizontal text alignment.").optional(),
      })
      .describe("A bold title for a page, section or card.")
      .strict(),
    { mixins: ["ComponentCommon", ColorPropSchema] },
  ),
} satisfies ComponentApi;
