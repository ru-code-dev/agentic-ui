import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { ColorPropSchema } from "../style-props.ts";
import { headingElements, headingSizes, textAligns } from "../tokens/index.ts";

export const HeadingApi = {
  name: "Heading",
  schema: spec(
    z
      .object({
        ...ColorPropSchema.shape,
        text: prop.content(commonRef(DynamicStringSchema, "DynamicString", "The heading text.")),
        as: prop.option(
          z
            .enum(headingElements)
            .describe(
              "Element and outline level (h1 = page title); independent of the visual size.",
            )
            .optional(),
        ),
        size: prop.style(
          "typography",
          headingSizes,
          "Visual size; 'md' and smaller suit card titles, 'xl' and larger suit page titles.",
        ),
        textAlign: prop.style("typography", textAligns, "Horizontal text alignment."),
      })
      .describe(
        "A bold title for a page, section or card. It has no margin, padding or size props: wrap it in a layout component for spacing.",
      )
      .strict(),
    { mixins: ["ComponentCommon", ColorPropSchema] },
  ),
} satisfies ComponentApi;
