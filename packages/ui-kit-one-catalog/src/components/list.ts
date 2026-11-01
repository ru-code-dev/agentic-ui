import { spec } from "@a2ui/web_core/catalog";
import { ChildListSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { listVariants, spaceTokens } from "../tokens/index.ts";
import { TEMPLATE_NOTE } from "./layout.ts";

export const ListApi = {
  name: "List",
  schema: spec(
    z
      .object({
        children: prop.child(
          commonRef(ChildListSchema, "ChildList", `The items: component ids, ${TEMPLATE_NOTE}`),
        ),
        variant: prop.style(
          "variant",
          listVariants,
          "'unordered' shows bullets, 'ordered' shows numbers, 'plain' shows no marker.",
        ),
        spacing: prop.style("space", spaceTokens, "Space between items."),
      })
      .describe("A vertical list of items; each child becomes one list item.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
