import { createComponentImplementation, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import type { ComponentApi } from "@a2ui/web_core/v0_9";
import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import { renderChildren, type ChildRef } from "./children.tsx";
import { componentMapping, type ComponentMapping, type PropMapping } from "./mapping.ts";
import type { FixedKeyCheck, PassthroughOptions, PassthroughProof } from "./passthrough-options.ts";

type Primitive = string | number | boolean;
type ValueMap = Readonly<Record<string, Primitive>>;

const TRANSLATIONS = {
  text: { kit: "children", note: "text content" },
  label: { kit: "children", note: "text content" },
  children: { kit: "children", note: "component references rendered in order" },
  child: { kit: "children", note: "component reference" },
} as const;

/** The enum values of a contract prop schema (optional unwrapped); empty for non-enum props. */
function enumValues(schema: z.ZodTypeAny | undefined): readonly string[] {
  const def = schema?._def as { innerType?: z.ZodTypeAny; values?: readonly string[] } | undefined;
  if (def?.innerType !== undefined) return enumValues(def.innerType);
  return def?.values ?? [];
}

/** Mapping entry of a value-mapped prop: every contract value → the kit value it renders as. */
function valueMapping(key: string, schema: z.ZodTypeAny | undefined, map: ValueMap): PropMapping {
  const all = [...new Set([...enumValues(schema), ...Object.keys(map)])];
  const values = Object.fromEntries(all.map((value) => [value, kitValue(map, value)]));
  return { kit: key, values, note: "values renamed by `passthrough` option `values`" };
}

/** The kit value of a contract value: renamed when the map lists it, unchanged otherwise. */
function kitValue<V>(map: ValueMap | undefined, value: V): V | Primitive {
  const key = String(value);
  const renamed = map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
  return renamed ?? value;
}

/**
 * A component whose contract is plain kit data (DEC-005): resolves dynamic values, passes every
 * prop 1:1, renders `children`/`child` references and puts `text`/`label` into kit `children`.
 * Partial kit props need no wrapper (DEC-046): a value subset is just a smaller contract enum
 * (`pickTokens`), `options.values` renames contract values to kit values, `options.fixed` sets kit
 * props the contract hides. All three are proven against the facade's prop types at compile time.
 */
export function passthrough<
  Api extends ComponentApi,
  KitProps,
  const O extends PassthroughOptions<Api, KitProps> = Record<never, never>,
>(
  api: Api,
  Kit: ComponentType<KitProps>,
  kitName: string,
  options?: O & FixedKeyCheck<Api, KitProps, O>,
  ..._proof: PassthroughProof<Api, KitProps, O>
): { readonly implementation: ReactComponentImplementation; readonly mapping: ComponentMapping } {
  const shape = (api.schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
  const keys = Object.keys(shape);
  const maps = (options?.values ?? {}) as Readonly<Record<string, ValueMap>>;
  const fixed = (options?.fixed ?? {}) as Readonly<Record<string, Primitive>>;
  const translated: Record<string, PropMapping> = Object.fromEntries(
    Object.entries(TRANSLATIONS).filter(([key]) => keys.includes(key)),
  );
  for (const [key, map] of Object.entries(maps))
    translated[key] = valueMapping(key, shape[key], map);
  // The proof above checks these props against the facade, so the loose view is safe.
  const LooseKit = Kit as unknown as ComponentType<Record<string, unknown>>;

  const implementation = createComponentImplementation(api, ({ props, buildChild }) => {
    const resolved = props as Record<string, unknown>;
    const kitProps: Record<string, unknown> = { ...fixed };
    let content: ReactNode = null;
    for (const key of keys) {
      const value = resolved[key];
      if (value === undefined) continue;
      if (key === "text" || key === "label") content = String(value);
      else if (key === "children")
        content = renderChildren(value as readonly ChildRef[], buildChild);
      else if (key === "child") content = buildChild(String(value));
      else kitProps[key] = kitValue(maps[key], value);
    }
    return <LooseKit {...kitProps}>{content}</LooseKit>;
  });

  return {
    implementation,
    mapping: {
      ...componentMapping(api, [kitName], translated as Partial<Record<string, PropMapping>>),
      ...(Object.keys(fixed).length > 0 ? { fixed } : {}),
    },
  };
}
