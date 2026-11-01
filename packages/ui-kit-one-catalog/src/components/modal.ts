import { spec } from "@a2ui/web_core/catalog";
import {
  ComponentIdSchema,
  DynamicBooleanSchema,
  DynamicStringSchema,
  type ComponentApi,
} from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";
import { modalSizes } from "../tokens/index.ts";

export const ModalApi = {
  name: "Modal",
  schema: spec(
    z
      .object({
        trigger: prop.trigger(
          commonRef(
            ComponentIdSchema,
            "ComponentId",
            "Component rendered in place that opens the modal when pressed, locally — usually a Button with an event action such as `modal.open` (that press is not sent to the agent).",
          ),
        ),
        content: prop.child(
          commonRef(
            ComponentIdSchema,
            "ComponentId",
            "Component shown in the modal body (often a Flex column).",
          ),
        ),
        title: prop.content(
          commonRef(
            DynamicStringSchema,
            "DynamicString",
            "Heading shown in the modal header.",
          ).optional(),
        ),
        size: prop.style("variant", modalSizes, "Width of the dialog."),
        open: prop.twoWay(
          commonRef(
            DynamicBooleanSchema,
            "DynamicBoolean",
            "Open state for programmatic control. Bind it to a data-model path: opening and closing write true/false back (two-way).",
          ).optional(),
        ),
        closeOnAction: prop.option(
          z
            .boolean()
            .describe(
              "Closes the modal after any event action fired inside its content (e.g. a confirm button); true when omitted.",
            )
            .optional(),
        ),
      })
      .describe(
        "A dialog with a close button, opened by its trigger; Escape or the close button dismisses it.",
      )
      .strict(),
    { mixins: ["ComponentCommon"] },
  ),
} satisfies ComponentApi;
