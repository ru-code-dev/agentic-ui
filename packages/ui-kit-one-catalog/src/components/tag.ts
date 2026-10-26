import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";
import { colorSchemes, controlSizes, tagVariants } from "../tokens/index.ts";

export const TagApi = {
  name: "Tag",
  schema: spec(
    z
      .object({
        label: commonRef(
          DynamicStringSchema,
          "DynamicString",
          "Tag text (statuses, categories, counts).",
        ),
        colorScheme: z
          .enum(colorSchemes)
          .describe(
            "Color palette; e.g. 'green' for success, 'orange' for pending, 'red' for errors.",
          )
          .optional(),
        variant: z.enum(tagVariants).describe("Fill style.").optional(),
        size: z.enum(controlSizes).describe("Height and font size of the tag.").optional(),
      })
      .describe("A small inline label for a status or category.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
