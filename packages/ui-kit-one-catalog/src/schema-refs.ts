import type { z } from "zod";

/** Names of the A2UI v0.9 `common_types.json` definitions the contract references. */
export type CommonDefName =
  | "ComponentId"
  | "ChildList"
  | "DynamicString"
  | "DynamicNumber"
  | "DynamicBoolean"
  | "DynamicValue"
  | "Action"
  | "CheckRule";

/**
 * Marks `schema` as the A2UI common type `defName`, so the generated catalog emits a `$ref` into
 * `common_types.json` instead of an inlined copy. This is the `REF:` description convention
 * `@a2ui/web_core` uses for its own catalogs.
 */
export function commonRef<T extends z.ZodTypeAny>(
  schema: T,
  defName: CommonDefName,
  description: string,
): T {
  return schema.describe(`REF:#/$defs/${defName}|${description}`);
}
