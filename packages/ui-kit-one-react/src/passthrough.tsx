import { createComponentImplementation, type ReactComponentImplementation } from "@a2ui/react/v0_9";
import type {
  ComponentApi,
  InferredComponentApiSchemaType,
  ResolveA2uiProps,
} from "@a2ui/web_core/v0_9";
import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import { renderChildren, type ChildRef } from "./children.tsx";
import { componentMapping, type ComponentMapping, type PropMapping } from "./mapping.ts";

/** Contract props the factory translates; every other prop passes to the kit unchanged. */
type TranslatedKey = "text" | "label" | "children" | "child";
type Contract<Api extends ComponentApi> = InferredComponentApiSchemaType<Api>;
/** Identity props as the binder hands them over (dynamic values resolved). */
type IdentityProps<Api extends ComponentApi> = Omit<
  Pick<
    ResolveA2uiProps<Contract<Api>>,
    keyof Contract<Api> & keyof ResolveA2uiProps<Contract<Api>>
  >,
  TranslatedKey
>;

type Defined<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };
/** Keys of the contract whose (defined) values are not valid values of the same kit prop. */
export type IdentityMismatch<Api extends ComponentApi, KitProps> = {
  [K in keyof IdentityProps<Api>]-?: K extends keyof KitProps
    ? Defined<IdentityProps<Api>>[K] extends Exclude<KitProps[K], undefined>
      ? never
      : K
    : K;
}[keyof IdentityProps<Api>];
/** Compile-time proof that the contract's identity props are valid props (and values) of the kit facade. */
type IdentityProof<Api extends ComponentApi, KitProps> = [IdentityMismatch<Api, KitProps>] extends [
  never,
]
  ? []
  : [never];

const TRANSLATIONS = {
  text: { kit: "children", note: "text content" },
  label: { kit: "children", note: "text content" },
  children: { kit: "children", note: "component references rendered in order" },
  child: { kit: "children", note: "component reference" },
} as const;

/**
 * A component whose contract is plain kit data (DEC-005): resolves dynamic values, passes every
 * prop 1:1, renders `children`/`child` references and puts `text`/`label` into kit `children`.
 */
export function passthrough<Api extends ComponentApi, KitProps>(
  api: Api,
  Kit: ComponentType<KitProps>,
  kitName: string,
  ..._proof: IdentityProof<Api, KitProps>
): { readonly implementation: ReactComponentImplementation; readonly mapping: ComponentMapping } {
  const keys = Object.keys((api.schema as z.AnyZodObject).shape);
  const translated = Object.fromEntries(
    Object.entries(TRANSLATIONS).filter(([key]) => keys.includes(key)),
  );
  // The identity proof above checks these props against the facade, so the loose view is safe.
  const LooseKit = Kit as unknown as ComponentType<Record<string, unknown>>;

  const implementation = createComponentImplementation(api, ({ props, buildChild }) => {
    const resolved = props as Record<string, unknown>;
    const kitProps: Record<string, unknown> = {};
    let content: ReactNode = null;
    for (const key of keys) {
      const value = resolved[key];
      if (value === undefined) continue;
      if (key === "text" || key === "label") content = String(value);
      else if (key === "children")
        content = renderChildren(value as readonly ChildRef[], buildChild);
      else if (key === "child") content = buildChild(String(value));
      else kitProps[key] = value;
    }
    return <LooseKit {...kitProps}>{content}</LooseKit>;
  });

  return {
    implementation,
    mapping: componentMapping(api, [kitName], translated as Partial<Record<string, PropMapping>>),
  };
}
