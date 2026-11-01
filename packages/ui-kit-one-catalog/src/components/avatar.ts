import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { avatarSizeTokens } from "../tokens/index.ts";

export const AvatarApi = {
  name: "Avatar",
  schema: spec(
    z
      .object({
        name: prop.content(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "Person or company name; its initials are shown when there is no image, and it is the accessible label.",
          ),
        ),
        src: prop.content(
          commonRef(DynamicStringSchema, "DynamicString", "Image URL (https).").optional(),
        ),
        size: prop.style(
          "variant",
          avatarSizeTokens,
          "Avatar diameter: xs 1.5rem … md 3rem … 2xl 8rem.",
        ),
      })
      .describe("A round picture or initials of a person or company.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
