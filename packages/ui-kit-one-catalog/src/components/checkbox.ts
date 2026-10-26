import { spec } from "@a2ui/web_core/catalog";
import { DynamicBooleanSchema, DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";
import { colorSchemes } from "../tokens/index.ts";
import { checksProp } from "./checks.ts";

export const CheckboxApi = {
  name: "Checkbox",
  schema: spec(
    z
      .object({
        label: commonRef(DynamicStringSchema, "DynamicString", "Text next to the box."),
        value: commonRef(
          DynamicBooleanSchema,
          "DynamicBoolean",
          "Checked state. Bind it to a data-model path: toggling writes true/false back (two-way).",
        ),
        colorScheme: z.enum(colorSchemes).describe("Color of the checked box.").optional(),
        isDisabled: commonRef(
          DynamicBooleanSchema,
          "DynamicBoolean",
          "Disables the checkbox.",
        ).optional(),
        checks: checksProp("The first failing message is shown under the checkbox."),
      })
      .describe("A single checkbox with a label, for consents, options and to-do items.")
      .strict(),
    { mixins: ["ComponentCommon", "Checkable"] },
  ),
} satisfies ComponentApi;
