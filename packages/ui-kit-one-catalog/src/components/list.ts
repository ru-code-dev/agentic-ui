import { spec } from "@a2ui/web_core/catalog";
import { ChildListSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";
import { listVariants, spaceTokens } from "../tokens/index.ts";

export const ListApi = {
  name: "List",
  schema: spec(
    z
      .object({
        children: commonRef(
          ChildListSchema,
          "ChildList",
          "The items: component ids, or a template `{ componentId, path }` that repeats one component per item of a data-model array (paths inside the template are relative to the item).",
        ),
        variant: z
          .enum(listVariants)
          .describe("'unordered' shows bullets, 'ordered' shows numbers, 'plain' shows no marker.")
          .optional(),
        spacing: z.enum(spaceTokens).describe("Space between items (space token).").optional(),
      })
      .describe("A vertical list of items; each child becomes one list item.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
