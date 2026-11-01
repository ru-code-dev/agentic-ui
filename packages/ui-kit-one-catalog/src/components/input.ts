import { spec } from "@a2ui/web_core/catalog";
import { DynamicBooleanSchema, DynamicStringSchema, type ComponentApi } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { inputTypes } from "../tokens/index.ts";
import { checksProp } from "./checks.ts";

export const InputApi = {
  name: "Input",
  schema: spec(
    z
      .object({
        label: prop.content(
          commonRef(DynamicStringSchema, "DynamicString", "Field label shown above the input."),
        ),
        value: prop.twoWay(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "Field value. Bind it to a data-model path: typing writes it back (two-way) — a string, or a number for type 'number' (an empty field writes \"\").",
          ),
        ),
        placeholder: prop.content(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "Hint shown while the field is empty.",
          ).optional(),
        ),
        type: prop.option(
          z
            .enum(inputTypes)
            .describe(
              "Keyboard and masking: 'password' hides the text, 'number' and 'tel' show numeric keyboards.",
            )
            .optional(),
        ),
        helperText: prop.content(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "Help text shown under the field while it is valid.",
          ).optional(),
        ),
        isRequired: prop.option(
          z
            .boolean()
            .describe("Marks the label with an asterisk; enforce it with a `required` check.")
            .optional(),
        ),
        isDisabled: prop.content(
          commonRef(DynamicBooleanSchema, "DynamicBoolean", "Disables the field.").optional(),
        ),
        checks: checksProp(
          "After the field is edited, the first failing message replaces the helper text.",
        ),
      })
      .describe("A labeled single-line text field with helper text and validation messages.")
      .strict(),
    { mixins: ["ComponentCommon", "Checkable"] },
  ),
} satisfies ComponentApi;
