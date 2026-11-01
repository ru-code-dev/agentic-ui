import { spec } from "@a2ui/web_core/catalog";
import { DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { CONTRACT_SOURCE, pickTokens, type ContractSource, controlSizes } from "../../src/index.ts";
import { prop } from "../../src/prop-kinds.ts";
import { commonRef } from "../../src/schema-refs.ts";

/** A fixture component exposing only part of a kit prop: `size` is a subset of the control sizes. */
export const BadgeApi = {
  name: "Badge",
  schema: spec(
    z
      .object({
        label: prop.content(commonRef(DynamicStringSchema, "DynamicString", "Badge text.")),
        size: prop.style("variant", pickTokens(controlSizes, ["sm", "md"]), "Badge size."),
      })
      .describe("A fixture badge.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;

/** The shipped contract source plus the fixture badge (role: status). */
export const withBadge: ContractSource = {
  ...CONTRACT_SOURCE,
  components: [...CONTRACT_SOURCE.components, BadgeApi],
  roles: { ...CONTRACT_SOURCE.roles, Badge: "status" },
};
