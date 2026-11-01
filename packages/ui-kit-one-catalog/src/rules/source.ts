import type { ComponentApi, FunctionApi } from "@a2ui/web_core/v0_9";
import { componentProps, type PropView } from "../contract-view.ts";
import type { ComponentRole } from "../prop-kinds.ts";

/** Everything the rule generators read: the contract and its metadata, nothing else. */
export interface ContractSource {
  readonly components: readonly ComponentApi[];
  readonly functions: readonly FunctionApi[];
  readonly roles: Readonly<Record<string, ComponentRole>>;
  readonly functionUses: Readonly<Record<string, string>>;
}

const unique = (items: readonly string[]) => [...new Set(items)];

/** Query helpers over a contract source, shared by the rule and interaction generators. */
export function view(source: ContractSource) {
  const props = source.components.flatMap(componentProps);
  const where = (test: (p: PropView) => boolean) => props.filter(test);
  return {
    props,
    where,
    unique,
    /**
     * Prop names matching `test`, deduplicated, in catalog order; a name that another kind also
     * uses is qualified (`Icon.name` vs `Avatar.name`).
     */
    names: (test: (p: PropView) => boolean) =>
      unique(
        where(test).map((p) =>
          props.some((other) => other.name === p.name && other.kind !== p.kind)
            ? `${p.component}.${p.name}`
            : p.name,
        ),
      ),
    /** Components with a prop matching `test`, in catalog order. */
    components: (test: (p: PropView) => boolean) => unique(where(test).map((p) => p.component)),
    /** Components of `role`, in catalog order. */
    ofRole: (role: ComponentRole) =>
      source.components.map((api) => api.name).filter((name) => source.roles[name] === role),
    /** Functions whose declared return type is `type`. */
    returning: (type: string) =>
      source.functions.filter((fn) => fn.returnType === type).map((fn) => fn.name),
  };
}

export const list = (items: readonly string[]) => items.join(", ");

/** `a, b (X, Y); c (Z)`: props grouped by the set of components that carry them. */
export function byComponents(props: readonly PropView[]): string {
  const owners = new Map<string, string[]>();
  for (const p of props)
    (owners.get(p.name) ?? owners.set(p.name, []).get(p.name))?.push(p.component);
  const groups = new Map<string, string[]>();
  for (const [name, components] of owners) {
    const key = components.join(", ");
    (groups.get(key) ?? groups.set(key, []).get(key))?.push(name);
  }
  return [...groups].map(([components, names]) => `${names.join(", ")} (${components})`).join("; ");
}
