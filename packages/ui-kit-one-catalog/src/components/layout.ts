import { ChildListSchema } from "@a2ui/web_core/v0_9";
import { prop } from "../prop-kinds.ts";
import { commonRef } from "../schema-refs.ts";

/** What every ChildList description says about the template form (EXPERIMENT §9). */
export const TEMPLATE_NOTE =
  "or ONE template object `{ componentId, path }` (an object, not an array) that repeats one component for every item of a data-model array; paths inside the template are relative to the item.";

/** The `children` prop shared by the layout components. */
export const layoutChildren = () =>
  prop.child(
    commonRef(
      ChildListSchema,
      "ChildList",
      `Child component ids in render order, ${TEMPLATE_NOTE}`,
    ).optional(),
  );
