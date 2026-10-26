import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { IconNameSchema } from "../icons.ts";
import { ColorPropSchema } from "../style-props.ts";
import { iconSizeTokens } from "../tokens/index.ts";

export const IconApi = {
  name: "Icon",
  schema: spec(
    z
      .object({
        ...ColorPropSchema.shape,
        name: IconNameSchema.describe("Which icon to show."),
        boxSize: z
          .enum(iconSizeTokens)
          .describe("Square box size (space token: 4 = 1rem, 8 = 2rem).")
          .optional(),
      })
      .describe("A decorative icon from the kit's icon set.")
      .strict(),
    { mixins: ["ComponentCommon", ColorPropSchema] },
  ),
} satisfies ComponentApi;
