import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { StylePropsSchema } from "../style-props.ts";
import { layoutChildren } from "./layout.ts";

export const ContainerApi = {
  name: "Container",
  schema: spec(
    z
      .object({
        ...StylePropsSchema.shape,
        children: layoutChildren(),
        centerContent: z
          .boolean()
          .describe("Centers the children horizontally inside the column.")
          .optional(),
      })
      .describe(
        'A horizontally centered page column with side padding; the usual outermost component of a screen. Set `maxW` to a container width such as "container.md".',
      )
      .strict(),
    { mixins: ["ComponentCommon", StylePropsSchema] },
  ),
} satisfies ComponentApi;
