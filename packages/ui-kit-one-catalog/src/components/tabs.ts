import { spec } from "@a2ui/web_core/catalog";
import {
  ComponentIdSchema,
  DynamicNumberSchema,
  DynamicStringSchema,
  type ComponentApi,
} from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { colorSchemes, tabsVariants } from "../tokens/index.ts";

const TabSchema = spec(
  z.object({
    title: commonRef(DynamicStringSchema, "DynamicString", "Tab caption."),
    child: commonRef(
      ComponentIdSchema,
      "ComponentId",
      "Component shown while the tab is selected.",
    ),
  }),
  { closure: "additionalProperties" },
);

export const TabsApi = {
  name: "Tabs",
  schema: spec(
    z
      .object({
        tabs: prop.child(z.array(TabSchema).min(1).describe("The tabs, in display order.")),
        variant: prop.style(
          "variant",
          tabsVariants,
          "'line' underlines the selected tab, 'enclosed' draws folder tabs, 'soft-rounded' uses pills.",
        ),
        colorScheme: prop.style("colorScheme", colorSchemes, "Color of the selected tab."),
        selectedIndex: prop.twoWay(
          commonRef(
            DynamicNumberSchema,
            "DynamicNumber",
            "Zero-based index of the selected tab. Bind it to a data-model path: switching tabs writes the index back (two-way).",
          ).optional(),
        ),
      })
      .describe("Tabbed panels; one child is visible at a time.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
