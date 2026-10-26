import { spec } from "@a2ui/web_core/catalog";
import { DynamicBooleanSchema, DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";
import { colorSchemes, directions } from "../tokens/index.ts";
import { checksProp } from "./checks.ts";

const RadioOptionSchema = spec(
  z.object({
    label: z.string().describe("Text shown for the option."),
    value: z.string().describe("Value written to the bound path when the option is chosen."),
  }),
  { closure: "additionalProperties" },
);

export const RadioGroupApi = {
  name: "RadioGroup",
  schema: spec(
    z
      .object({
        label: commonRef(DynamicStringSchema, "DynamicString", "Question or caption of the group."),
        options: z.array(RadioOptionSchema).min(1).describe("The choices, in display order."),
        value: commonRef(
          DynamicStringSchema,
          "DynamicString",
          "The chosen option `value`. Bind it to a data-model path: choosing writes the value back (two-way).",
        ),
        direction: z
          .enum(directions)
          .describe("'column' stacks the options, 'row' places them side by side.")
          .optional(),
        colorScheme: z.enum(colorSchemes).describe("Color of the selected radio.").optional(),
        isDisabled: commonRef(
          DynamicBooleanSchema,
          "DynamicBoolean",
          "Disables every option.",
        ).optional(),
        checks: checksProp("The first failing message is shown under the group."),
      })
      .describe("A labeled group of mutually exclusive options (one choice).")
      .strict(),
    { mixins: ["ComponentCommon", "Checkable"] },
  ),
} satisfies ComponentApi;
