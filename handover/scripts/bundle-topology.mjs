/**
 * SV-C23 / A3-09 / SV-C28: the component tree rules of handover/README.md steps 4–5, from the bundle's catalog.json
 * alone: child references (ComponentId, ChildList, arrays of objects with a ComponentId field), self-references,
 * cycles and depth (at most 50 levels below the start; root = level 0, a child reference adds 1; first-visit depth,
 * as web_core), root, dangling references, orphans. Every lookup by a payload-chosen name is an own-property one
 * (A4-32: a component type or function named `constructor`/`toString` gets a verdict, never a TypeError).
 * Shipped in the bundle (scripts/), used by bundle-validator.mjs and bundle-state.mjs.
 */
const COMMON = "https://a2ui.org/specification/v0_9/common_types.json";
const MAX_DEPTH = 50;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Own and allOf (non-$ref) properties of a component schema. */
export function propsOf(schema, depth = 0) {
  if (!isObject(schema) || depth > 4) return {};
  const out = { ...schema.properties };
  for (const part of schema.allOf ?? []) if (isObject(part) && !("$ref" in part)) Object.assign(out, propsOf(part, depth + 1));
  return out;
}

/** Component type → { single, lists: Set of fields, nested: field → [keys] } (a Map: no prototype lookups). */
export function refMap(catalog) {
  const out = new Map();
  for (const [name, schema] of Object.entries(catalog.components)) {
    const refs = { single: new Set(), lists: new Set(), nested: new Map() };
    for (const [prop, sub] of Object.entries(propsOf(schema))) {
      if (sub?.$ref === `${COMMON}#/$defs/ComponentId`) refs.single.add(prop);
      else if (sub?.$ref === `${COMMON}#/$defs/ChildList`) refs.lists.add(prop);
      else if (sub?.type === "array" && isObject(sub.items)) {
        const keys = Object.entries(propsOf(sub.items)).filter(([, v]) => String(v?.$ref).endsWith("/ComponentId"));
        if (keys.length > 0) {
          refs.lists.add(prop);
          refs.nested.set(prop, keys.map(([key]) => key));
        }
      }
    }
    if (refs.single.size + refs.lists.size > 0) out.set(name, refs);
  }
  return out;
}
export const fieldsOf = (refs, type) => (typeof type === "string" ? refs.get(type) : undefined);

export function pointers(value, nested, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => pointers(item, nested, out));
  else if (isObject(value)) {
    if (typeof value.componentId === "string" && ("path" in value || "dataBinding" in value)) out.push(value.componentId);
    else if (nested) {
      for (const key of nested) if (Object.hasOwn(value, key)) pointers(value[key], null, out);
    } else Object.values(value).forEach((sub) => pointers(sub, null, out));
  }
  return out;
}
const childRefs = (comp, refs) => {
  const fields = fieldsOf(refs, comp.component);
  if (!fields) return [];
  return Object.entries(comp)
    .filter(([key]) => fields.single.has(key) || fields.lists.has(key))
    .flatMap(([key, value]) => pointers(value, fields.nested.get(key), []));
};

/** Depth-first walk from `start` (first-visit depth, as web_core): cycle and depth problems. */
function walk(children, components, visited, start, problems) {
  const onPath = new Set();
  const stack = [];
  const enter = (node, depth) => {
    if (depth > MAX_DEPTH) problems.push({ rule: "tree-depth", detail: `${node} is ${depth} levels below ${start}` });
    visited.add(node);
    onPath.add(node);
    const kids = (children.get(node) ?? []).filter((c) => components.has(c) && c !== node);
    stack.push([node, kids[Symbol.iterator](), depth]);
  };
  enter(start, 0);
  while (stack.length > 0) {
    const [node, kids, depth] = stack.at(-1);
    const next = kids.next();
    if (next.done) {
      onPath.delete(node);
      stack.pop();
    } else if (!visited.has(next.value)) enter(next.value, depth + 1);
    else if (onPath.has(next.value)) problems.push({ rule: "cycle", detail: next.value });
  }
}

const childrenOf = (components, refs) => new Map([...components].map(([id, comp]) => [id, childRefs(comp, refs)]));

/** Step 4, after every updateComponents: self-references, then a walk from every component (id order). */
export function cycles(components, refs, problems) {
  const children = childrenOf(components, refs);
  for (const [id, kids] of children) if (kids.includes(id)) problems.push({ rule: "self-reference", detail: id });
  const visited = new Set();
  for (const id of [...components.keys()].toSorted()) if (!visited.has(id)) walk(children, components, visited, id, problems);
}

/** Step 5, once per reply for a touched surface: root, dangling references, cycles/depth from root, orphans. */
export function tree(components, changed, refs, problems) {
  const children = childrenOf(components, refs);
  for (const [id, kids] of children)
    for (const kid of kids) if (kid !== id && !components.has(kid)) problems.push({ rule: "dangling-child", detail: `${id} → ${kid}` });
  if (!components.has("root")) return problems.push({ rule: "missing-root", detail: [...components.keys()][0] });
  const visited = new Set();
  walk(children, components, visited, "root", problems);
  for (const id of new Set(changed)) if (components.has(id) && !visited.has(id)) problems.push({ rule: "orphan", detail: id });
}
