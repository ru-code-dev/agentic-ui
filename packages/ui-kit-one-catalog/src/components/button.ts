import { spec } from "@a2ui/web_core/catalog";
import {
  ActionSchema,
  DynamicBooleanSchema,
  DynamicStringSchema,
  type ComponentApi,
} from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { IconNameSchema } from "../icons.ts";
import { commonRef } from "../schema-refs.ts";
import { buttonVariants, colorSchemes, controlSizes } from "../tokens/index.ts";
import { checksProp } from "./checks.ts";

export const ButtonApi = {
  name: "Button",
  schema: spec(
    z
      .object({
        label: commonRef(DynamicStringSchema, "DynamicString", "The button caption."),
        action: commonRef(
          ActionSchema,
          "Action",
          "What a press does: an `event` sent to the agent (with an optional resolved `context`) or a local `functionCall`. Required, also for a Modal trigger (use an event such as `modal.open`).",
        ),
        variant: z
          .enum(buttonVariants)
          .describe(
            "Visual emphasis: 'solid' for the main action, 'outline' or 'ghost' for secondary ones, 'link' for inline text actions.",
          )
          .optional(),
        colorScheme: z
          .enum(colorSchemes)
          .describe("Color palette; 'blue' for primary actions, 'red' for destructive ones.")
          .optional(),
        size: z.enum(controlSizes).describe("Button height and font size.").optional(),
        leftIcon: IconNameSchema.describe("Icon shown before the label.").optional(),
        rightIcon: IconNameSchema.describe("Icon shown after the label.").optional(),
        isDisabled: commonRef(
          DynamicBooleanSchema,
          "DynamicBoolean",
          "Disables the button.",
        ).optional(),
        isLoading: commonRef(
          DynamicBooleanSchema,
          "DynamicBoolean",
          "Shows a spinner and blocks presses.",
        ).optional(),
        isFullWidth: z
          .boolean()
          .describe("Stretches the button to the width of its container.")
          .optional(),
        checks: checksProp(
          "The button is disabled while any rule fails (e.g. until a form is valid).",
        ),
      })
      .describe("A pressable button that fires its action.")
      .strict(),
    { mixins: ["ComponentCommon", "Checkable"] },
  ),
} satisfies ComponentApi;
