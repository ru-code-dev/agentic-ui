import type { ComponentApi } from "@a2ui/web_core/v0_9";
import type { z } from "zod";
import { propDoc } from "./docs/prop-docs.ts";
import { propMeta, type PropKind, type StyleGroup } from "./prop-kinds.ts";

/** One prop of one component, as the generators see it. */
export interface PropView {
  readonly component: string;
  readonly name: string;
  readonly kind: PropKind;
  readonly group: StyleGroup | undefined;
  readonly required: boolean;
  /** Common type the prop refers to (ChildList, ComponentId, Action, …), if any. */
  readonly ref: string | undefined;
  /** Allowed literal values of an enum prop (style tokens, options). */
  readonly values: readonly string[];
}

/** Enum values behind optional/default wrappers; empty for non-enum props. */
function enumValues(schema: z.ZodTypeAny): readonly string[] {
  let current = schema;
  for (;;) {
    const def = current._def as { typeName: string; innerType?: z.ZodTypeAny; values?: string[] };
    if (def.typeName === "ZodEnum") return def.values ?? [];
    if (def.innerType === undefined) return [];
    current = def.innerType;
  }
}

const shapeOf = (api: ComponentApi) =>
  (api.schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;

/** Every prop of `api` with its kind; throws when a prop has none (SV-C22). */
export function componentProps(api: ComponentApi): PropView[] {
  return Object.entries(shapeOf(api)).map(([name, schema]) => {
    const meta = propMeta(schema);
    if (meta === undefined) throw new Error(`${api.name}.${name} has no prop kind (prop-kinds.ts)`);
    const doc = propDoc(name, schema);
    const ref = /^[A-Z]/.test(doc.type) ? doc.type : undefined;
    return {
      component: api.name,
      name,
      kind: meta.kind,
      group: meta.group,
      required: doc.required,
      ref,
      values: enumValues(schema),
    };
  });
}

/** Props of `kind` across `apis`, in catalog order. */
export const propsOfKind = (apis: readonly ComponentApi[], kind: PropKind) =>
  apis.flatMap(componentProps).filter((p) => p.kind === kind);

/** `Component.prop` labels. */
export const qualified = (props: readonly PropView[]) =>
  props.map((p) => `${p.component}.${p.name}`);

/** Two-way props per component (renderer writes them back), derived from the kinds. */
export function twoWayBindings(apis: readonly ComponentApi[]): Record<string, readonly string[]> {
  const result: Record<string, string[]> = {};
  for (const p of propsOfKind(apis, "two-way")) (result[p.component] ??= []).push(p.name);
  return result;
}
