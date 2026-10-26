import { ChildListSchema } from "@a2ui/web_core/v0_9";
import { commonRef } from "../schema-refs.ts";

/** The `children` prop shared by the layout components. */
export const layoutChildren = () =>
  commonRef(
    ChildListSchema,
    "ChildList",
    "Child component ids in render order, or a template `{ componentId, path }` that repeats one component for every item of a data-model array.",
  ).optional();
