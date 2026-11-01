import type { ComponentApi } from "@a2ui/web_core/v0_9";
import type { ComponentType } from "react";
import type { z } from "zod";

/** How one contract prop reaches the kit. */
export interface PropMapping {
  /** Kit prop (or part) that receives the value, e.g. `variant`, `children`, `FormLabel`. */
  readonly kit: string;
  /** Contract value → kit value, when values are renamed (passthrough: applied by option `values`). */
  readonly values?: Readonly<Record<string, string | number | boolean>>;
  /** Behavior beyond a straight pass-through (bindings, derived values). */
  readonly note?: string;
  /** Same name and values in contract and kit (DEC-005): passed through unchanged. */
  readonly identity?: true;
}

/** Contract → kit mapping of one component; MAPPING.md is generated from these (`pnpm build`, D2-10). */
export interface ComponentMapping {
  readonly component: string;
  /** Kit facades the implementation renders. */
  readonly kit: readonly string[];
  /** Every contract prop, in contract order. */
  readonly props: Readonly<Record<string, PropMapping>>;
  /** Kit props the contract hides, always rendered with these values (DEC-046). */
  readonly fixed?: Readonly<Record<string, string | number | boolean>>;
}

/** The resolved-prop keys of a contract component. */
export type ContractKey<Api extends ComponentApi> = keyof z.infer<Api["schema"]> & string;

/**
 * Builds a component mapping: declare only the props that need translation; every other contract
 * prop is an identity prop (same name and values as the kit). Unknown translated props throw.
 */
export function componentMapping<
  Api extends ComponentApi,
  const T extends Partial<Record<ContractKey<Api>, PropMapping>>,
>(
  api: Api,
  kit: readonly string[],
  translated: T,
): ComponentMapping & { readonly identityKeys: readonly Exclude<ContractKey<Api>, keyof T>[] } {
  const keys = Object.keys((api.schema as z.AnyZodObject).shape) as ContractKey<Api>[];
  const unknown = Object.keys(translated).filter((key) => !keys.includes(key as ContractKey<Api>));
  if (unknown.length > 0)
    throw new Error(`${api.name} mapping names props the contract lacks: ${unknown.join(", ")}`);
  const identityKeys = keys.filter((key) => !(key in translated)) as Exclude<
    ContractKey<Api>,
    keyof T
  >[];
  const props = Object.fromEntries(
    keys.map((key) => [
      key,
      (translated as Record<string, PropMapping>)[key] ?? { kit: key, identity: true as const },
    ]),
  );
  return { component: api.name, kit, props, identityKeys };
}

/**
 * The identity props present on `props`, ready to spread onto `Kit`. Every key must be a prop of
 * the kit facade (checked at compile time); undefined values are dropped so kit defaults apply.
 */
export function identityProps<Props, KitProps, K extends keyof Props & keyof KitProps>(
  _kit: ComponentType<KitProps>,
  props: Props,
  keys: readonly K[],
): { [P in K]?: Exclude<Props[P], undefined> } {
  const picked: Partial<Record<K, unknown>> = {};
  for (const key of keys) {
    if (props[key] !== undefined) picked[key] = props[key];
  }
  return picked as { [P in K]?: Exclude<Props[P], undefined> };
}
