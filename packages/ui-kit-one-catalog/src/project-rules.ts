/**
 * Project rules beyond web_core (SV-C28 referee layer, A4-26/27/29/30/31, A5-01, A5-02): the one implementation the
 * page store (`createChatSurfaces`) runs and the agreement suites import, so the reference server's Python validator
 * (validation/integrity.py, surfaces.py, bindings.py) and the page are proven to agree.
 *   - no `__proto__` key in any object (A4-29);
 *   - no `path`/`@path` string anywhere with a segment web_core's data model forbids (A4-27, read via DataModel);
 *   - no empty or blank `surfaceId` (A4-30); no non-string `component` in a component update (A4-31);
 *   - a ChildList template path is not "" or "." (A4-27);
 *   - on every touched, non-assumed surface: walking from `root` as the renderer instantiates templates (≤ 100
 *     items per list, ≤ 5000 instances), no DynamicString/Number/Boolean prop (also inside the items of a literal
 *     array prop, e.g. `Tabs.tabs[].title`, A5-02) bound with {path} to an object or an array, a row list
 *     (`Table.rows`, A5-02) bound only to an array of objects, and no template over something other than an array.
 */
import { DataModel } from "@a2ui/web_core/v0_9";
import { buildCatalogJson, uiKitOneContract } from "./catalog.ts";

type Json = Record<string, unknown>;
/** component type → prop (`tabs[].title` = `title` of every item of `tabs`) → the kind of value it needs. */
export type BindingKinds = Readonly<Record<string, Readonly<Record<string, string>>>>;
interface ChildRefs {
  readonly singleRefs?: Iterable<string>;
  readonly listRefs?: Iterable<string>;
  readonly nestedRefs?: Readonly<Record<string, Iterable<string>>>;
}
/** What the rules read of a surface (RendererState's web_core surface). */
export interface RuleSurface {
  readonly componentsModel: {
    has(id: string): boolean;
    get(id: string): { readonly type: string; readonly properties: object } | undefined;
  };
  readonly dataModel: { get(path: string): unknown };
}

const KINDS: Readonly<Record<string, string>> = {
  DynamicString: "a string",
  DynamicNumber: "a number",
  DynamicBoolean: "a boolean",
};
/** DynamicValue props the kit renders only from an array of objects (A5-02; table.tsx drops anything else). */
export const ROW_LISTS: Readonly<Record<string, readonly string[]>> = { Table: ["rows"] };
export const ROW_KIND = "an array of objects";
const COMMON = "https://a2ui.org/";
const MAX_TEMPLATE_ITEMS = 100;
const MAX_VISITS = 5000;
const ACTIONS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"];

const fail = (message: string): never => {
  throw new Error(message);
};
const isObject = (v: unknown): v is Json =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const own = <T>(o: Readonly<Record<string, T>>, k: unknown): T | undefined =>
  typeof k === "string" && Object.hasOwn(o, k) ? o[k] : undefined;
const isTemplate = (v: unknown): v is { componentId: string; path: string } =>
  isObject(v) && typeof v.componentId === "string" && typeof v.path === "string";

/** Own and `allOf` properties of a component schema (`$ref`s into common types are not followed). */
function propsOf(schema: unknown, depth = 0): Json {
  if (!isObject(schema) || depth > 4) return {};
  const out: Json = { ...(schema.properties as Json | undefined) };
  for (const sub of (schema.allOf as unknown[] | undefined) ?? [])
    if (isObject(sub) && !("$ref" in sub)) Object.assign(out, propsOf(sub, depth + 1));
  return out;
}
const kindOf = (sub: unknown) => {
  const ref = isObject(sub) && typeof sub.$ref === "string" ? sub.$ref : "";
  return ref.startsWith(COMMON) ? own(KINDS, ref.split("#/$defs/")[1]) : undefined;
};

/** The binding kinds of a catalog document (catalog.json): from its `$ref`s to common_types Dynamic*. */
export function bindingKinds(catalog: Json): BindingKinds {
  const kinds: Record<string, Record<string, string>> = {};
  for (const [name, schema] of Object.entries(catalog.components as Json)) {
    for (const [prop, sub] of Object.entries(propsOf(schema))) {
      const kind = kindOf(sub);
      if (kind) (kinds[name] ??= {})[prop] = kind;
      if (!isObject(sub) || sub.type !== "array") continue;
      for (const [key, item] of Object.entries(propsOf(sub.items))) {
        const itemKind = kindOf(item);
        if (itemKind) (kinds[name] ??= {})[`${prop}[].${key}`] = itemKind;
      }
    }
    for (const prop of own(ROW_LISTS, name) ?? [])
      if (prop in propsOf(schema)) (kinds[name] ??= {})[prop] = ROW_KIND;
  }
  return kinds;
}

/** A binding path resolved against the template context `ctx` (absolute paths stay as they are). */
function resolve(path: string, ctx: string): string {
  if (path.startsWith("/")) return path;
  let base = ctx.endsWith("/") && ctx.length > 1 ? ctx.slice(0, -1) : ctx;
  if (path === "" || path === ".") return base || "/";
  if (base === "/") base = "";
  return `${base}/${path}`;
}

/** The value at `path` of a data model, `undefined` when the path cannot be read. */
function read(model: RuleSurface["dataModel"], path: string): unknown {
  try {
    return model.get(path);
  } catch {
    return undefined;
  }
}

/** Whether `held` (a bound value, never undefined) fits a prop that needs `kind`. */
const fits = (kind: string, held: unknown) =>
  kind === ROW_KIND
    ? held === null || (Array.isArray(held) && held.every(isObject))
    : held === null || typeof held !== "object";

/** The `{path}` bindings of `props` that `kinds` names: [label, path, kind]. */
function bindingsOf(props: Json, kinds: Readonly<Record<string, string>>) {
  const out: [string, string, string][] = [];
  const add = (label: string, v: unknown, kind: string) => {
    if (isObject(v) && Object.keys(v).length === 1 && typeof v.path === "string")
      out.push([label, v.path, kind]);
  };
  for (const [key, kind] of Object.entries(kinds)) {
    const [prop = key, sub] = key.split("[].");
    if (sub === undefined) add(prop, props[prop], kind);
    else if (Array.isArray(props[prop]))
      (props[prop] as unknown[]).forEach((item, i) => {
        if (isObject(item)) add(`${prop}[${i}].${sub}`, item[sub], kind);
      });
  }
  return out;
}

function pointers(value: unknown, nested: Iterable<string> | undefined, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) pointers(item, nested, out);
  else if (isObject(value)) {
    if (typeof value.componentId === "string" && ("path" in value || "dataBinding" in value))
      out.push(value.componentId);
    else if (nested)
      for (const key of nested)
        if (key in value) pointers(value[key], undefined, out);
        else for (const sub of Object.values(value)) pointers(sub, undefined, out);
  }
}

export interface ProjectRules {
  /** Rules on the messages themselves (before they are applied); throws the first problem. */
  checkMessages(messages: unknown): void;
  /** Rules on a surface's merged state; throws the first problem. */
  checkSurface(surface: RuleSurface): void;
}

export function projectRules(
  catalog: Json = buildCatalogJson(uiKitOneContract),
  refMap: Readonly<Record<string, ChildRefs>> = uiKitOneContract.componentRefMap,
): ProjectRules {
  const kinds = bindingKinds(catalog);
  const probe = new DataModel({});
  const walkStatic = (value: unknown) => {
    const stack = [value];
    while (stack.length > 0) {
      const item = stack.pop();
      if (Array.isArray(item)) stack.push(...item);
      if (!isObject(item)) continue;
      if (Object.hasOwn(item, "__proto__")) fail("Forbidden key '__proto__'");
      for (const key of ["path", "@path"]) {
        const path = item[key];
        if (typeof path === "string") probe.get(path);
      }
      stack.push(...Object.values(item));
    }
  };
  function checkMessages(messages: unknown) {
    for (const message of Array.isArray(messages) ? messages : [messages]) {
      walkStatic(message);
      for (const action of ACTIONS) {
        const body = isObject(message) ? message[action] : undefined;
        if (!isObject(body)) continue;
        if (typeof body.surfaceId === "string" && body.surfaceId.trim() === "")
          fail("blank surfaceId");
        if (action !== "updateComponents" || !Array.isArray(body.components)) continue;
        for (const comp of body.components as unknown[]) {
          if (!isObject(comp)) continue;
          if ("component" in comp && typeof comp.component !== "string")
            fail("non-string component type");
          for (const key of own(refMap, comp.component)?.listRefs ?? []) {
            const value = comp[key];
            if (isTemplate(value) && (value.path === "" || value.path === "."))
              fail("empty template path");
          }
        }
      }
    }
  }
  function checkSurface(surface: RuleSurface) {
    const components = surface.componentsModel;
    if (!components.has("root")) return;
    const stack: [string, string][] = [["root", "/"]];
    const seen = new Set<string>();
    let visits = 0;
    while (stack.length > 0 && visits < MAX_VISITS) {
      const [cid, ctx] = stack.pop() as [string, string];
      const comp = components.get(cid);
      if (!comp || seen.has(`${cid}\u0000${ctx}`)) continue;
      seen.add(`${cid}\u0000${ctx}`);
      visits++;
      const props = (comp.properties ?? {}) as Json;
      for (const [label, path, kind] of bindingsOf(props, own(kinds, comp.type) ?? {})) {
        const held = read(surface.dataModel, resolve(path, ctx));
        if (held !== undefined && !fits(kind, held))
          fail(
            kind === ROW_KIND
              ? `'${cid}' binds '${label}' to a value that is not ${kind}`
              : `'${cid}' binds '${label}' to an object or array`,
          );
      }
      const refs = own(refMap, comp.type);
      const keys = refs ? [...new Set([...(refs.singleRefs ?? []), ...(refs.listRefs ?? [])])] : [];
      const kids: [string, string][] = [];
      for (const key of keys.toSorted()) {
        const value = props[key];
        if (!isTemplate(value)) {
          const ids: string[] = [];
          pointers(value, own(refs?.nestedRefs ?? {}, key), ids);
          kids.push(...ids.map((id): [string, string] => [id, ctx]));
          continue;
        }
        const listPath = resolve(value.path, ctx);
        const items = read(surface.dataModel, listPath);
        if (Array.isArray(items)) {
          for (let i = 0; i < Math.min(items.length, MAX_TEMPLATE_ITEMS); i++)
            kids.push([value.componentId, resolve(String(i), listPath)]);
        } else if (items !== undefined && items !== null)
          fail(`'${cid}' repeats a template over a non-array`);
      }
      stack.push(...kids.toReversed());
    }
  }
  return { checkMessages, checkSurface };
}
