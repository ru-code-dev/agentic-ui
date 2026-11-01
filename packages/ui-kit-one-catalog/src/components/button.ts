import { spec } from "@a2ui/web_core/catalog";
import {
  ActionSchema,
  DynamicBooleanSchema,
  DynamicStringSchema,
  type ComponentApi,
} from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { IconNameSchema } from "../icons.ts";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { buttonVariants, colorSchemes, controlSizes } from "../tokens/index.ts";
import { checksProp } from "./checks.ts";

export const ButtonApi = {
  name: "Button",
  schema: spec(
    z
      .object({
        label: prop.content(commonRef(DynamicStringSchema, "DynamicString", "The button caption.")),
        action: prop.action(
          commonRef(
            ActionSchema,
            "Action",
            "What a press does: an `event` sent to the agent (with an optional resolved `context`) or a local `functionCall`. Required, also for a Modal trigger (use an event such as `modal.open`; a trigger press only opens the modal and is not sent).",
          ),
        ),
        variant: prop.style(
          "variant",
          buttonVariants,
          "Visual emphasis: 'solid' for the main action, 'outline' or 'ghost' for secondary ones, 'link' for inline text actions.",
        ),
        colorScheme: prop.style(
          "colorScheme",
          colorSchemes,
          "Color palette; 'blue' for primary actions, 'red' for destructive ones.",
        ),
        size: prop.style("variant", controlSizes, "Button height and font size."),
        leftIcon: prop.option(IconNameSchema.describe("Icon shown before the label.").optional()),
        rightIcon: prop.option(IconNameSchema.describe("Icon shown after the label.").optional()),
        isDisabled: prop.content(
          commonRef(DynamicBooleanSchema, "DynamicBoolean", "Disables the button.").optional(),
        ),
        isLoading: prop.content(
          commonRef(
            DynamicBooleanSchema,
            "DynamicBoolean",
            "Shows a spinner and blocks presses.",
          ).optional(),
        ),
        isFullWidth: prop.option(
          z.boolean().describe("Stretches the button to the width of its container.").optional(),
        ),
        checks: checksProp(
          "The button is disabled while any rule fails (e.g. until a form is valid).",
        ),
      })
      .describe("A pressable button that fires its action.")
      .strict(),
    { mixins: ["ComponentCommon", "Checkable"] },
  ),
} satisfies ComponentApi;
