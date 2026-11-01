import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { colorSchemes, controlSizes, tagVariants } from "../tokens/index.ts";

export const TagApi = {
  name: "Tag",
  schema: spec(
    z
      .object({
        label: prop.content(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "Tag text (statuses, categories, counts).",
          ),
        ),
        colorScheme: prop.style(
          "colorScheme",
          colorSchemes,
          "Color palette; e.g. 'green' for success, 'orange' for pending, 'red' for errors. In a ChildList template every item gets the same palette: keep it neutral (or omit it) and bind only the label.",
        ),
        variant: prop.style("variant", tagVariants, "Fill style."),
        size: prop.style("variant", controlSizes, "Height and font size of the tag."),
      })
      .describe("A small inline label for a status or category.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
