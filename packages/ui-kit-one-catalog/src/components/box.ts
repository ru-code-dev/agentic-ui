import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { StylePropsSchema } from "../style-props.ts";
import { layoutChildren } from "./layout.ts";

export const BoxApi = {
  name: "Box",
  schema: spec(
    z
      .object({ ...StylePropsSchema.shape, children: layoutChildren() })
      .describe(
        "A plain block container that stacks its children vertically; use it for cards, panels and sections.",
      )
      .strict(),
    { mixins: ["ComponentCommon", StylePropsSchema] },
  ),
} satisfies ComponentApi;
