import { spec } from "@a2ui/web_core/catalog";
import { DynamicBooleanSchema, DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { colorSchemes } from "../tokens/index.ts";

export const SwitchApi = {
  name: "Switch",
  schema: spec(
    z
      .object({
        label: prop.content(
          commonRef(DynamicStringSchema, "DynamicString", "Text describing the setting."),
        ),
        value: prop.twoWay(
          commonRef(
            DynamicBooleanSchema,
            "DynamicBoolean",
            "On/off state. Bind it to a data-model path: toggling writes true/false back (two-way).",
          ),
        ),
        colorScheme: prop.style("colorScheme", colorSchemes, "Track color when on."),
        isDisabled: prop.content(
          commonRef(DynamicBooleanSchema, "DynamicBoolean", "Disables the switch.").optional(),
        ),
      })
      .describe("An on/off toggle with a label, for settings that take effect immediately.")
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
