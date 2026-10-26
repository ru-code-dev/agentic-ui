import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { StylePropsSchema } from "../style-props.ts";
import { layoutChildren } from "./layout.ts";

export const CenterApi = {
  name: "Center",
  schema: spec(
    z
      .object({ ...StylePropsSchema.shape, children: layoutChildren() })
      .describe(
        "A container that centers its children horizontally and vertically (empty states, icons, badges).",
      )
      .strict(),
    { mixins: ["ComponentCommon", StylePropsSchema] },
  ),
} satisfies ComponentApi;
