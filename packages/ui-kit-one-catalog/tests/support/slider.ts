import { spec } from "@a2ui/web_core/catalog";
import { DynamicNumberSchema, DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { CONTRACT_SOURCE, type ContractSource, colorSchemes } from "../../src/index.ts";
import { checksProp } from "../../src/components/checks.ts";
import { prop } from "../../src/prop-kinds.ts";
import { commonRef } from "../../src/schema-refs.ts";

/** A fixture component written the way CONTRACTS.md "How to add a component" says. */
export const SliderApi = {
  name: "Slider",
  schema: spec(
    z
      .object({
        label: prop.content(commonRef(DynamicStringSchema, "DynamicString", "Caption.")),
        value: prop.twoWay(commonRef(DynamicNumberSchema, "DynamicNumber", "Bound value.")),
        colorScheme: prop.style("colorScheme", colorSchemes, "Track color."),
        checks: checksProp("Message under the slider."),
      })
      .describe("A fixture slider.")
      .strict(),
    { mixins: ["ComponentCommon", "Checkable"] },
  ),
} satisfies ComponentApi;

/** The shipped contract source plus the fixture slider (role: input). */
export const withSlider: ContractSource = {
  ...CONTRACT_SOURCE,
  components: [...CONTRACT_SOURCE.components, SliderApi],
  roles: { ...CONTRACT_SOURCE.roles, Slider: "input" },
};
