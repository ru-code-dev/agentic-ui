import { spec } from "@a2ui/web_core/catalog";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { StylePropsSchema } from "../style-props.ts";
import { layoutChildren } from "./layout.ts";

export const ContainerApi = {
  name: "Container",
  schema: spec(
    z
      .object({
        ...StylePropsSchema.shape,
        children: layoutChildren(),
        centerContent: prop.option(
          z.boolean().describe("Centers the children horizontally inside the column.").optional(),
        ),
      })
      .describe(
        'The page column: centered horizontally with side padding; the usual root of a screen. Set `maxW` to a container width such as "container.md". Use it (not a Box with auto margins) to center a page.',
      )
      .strict(),
    { mixins: ["ComponentCommon", StylePropsSchema] },
  ),
} satisfies ComponentApi;
