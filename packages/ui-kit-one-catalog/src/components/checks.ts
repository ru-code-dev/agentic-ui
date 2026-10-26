import { CheckRuleSchema } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { commonRef } from "../schema-refs.ts";

/**
 * The `checks` prop of Checkable components. Declared in Zod as well as through the `Checkable`
 * mixin, so the runtime validator accepts what the catalog JSON allows.
 */
export const checksProp = (effect: string) =>
  z
    .array(
      commonRef(
        CheckRuleSchema,
        "CheckRule",
        "A rule: a `condition` (a boolean function call such as required, email, regex, length or numeric) and the `message` shown when it fails.",
      ),
    )
    .describe(`Validation rules evaluated against the data model. ${effect}`)
    .optional();
