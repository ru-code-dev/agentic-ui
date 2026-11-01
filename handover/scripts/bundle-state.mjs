/**
 * SV-C28: a chat's surface state and the merge of one reply into it (handover/README.md steps 4–5), from the
 * bundle's catalog.json alone: surfaceId → { components (id → component, `component` = its type), data }.
 * `mergeMessage` applies one message the way the renderer does (create, delete, component replace, data-model write
 * with web_core DataModel.set's rules) and reports step-4 problems; `checkBindings` is step 5's bound-value rule.
 * Shipped in the bundle (scripts/), used by bundle-validator.mjs.
 */
import { cycles, fieldsOf, pointers } from "./bundle-topology.mjs";

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const INDEX = /^(0|[1-9][0-9]*)$/;
const MAX_INDEX = 10000;
const KINDS = { DynamicString: "a string", DynamicNumber: "a number", DynamicBoolean: "a boolean" };
/** DynamicValue props the kit renders only from an array of objects (the kit drops anything else). */
const ROW_LISTS = { Table: ["rows"] };
const ROW_KIND = "an array of objects";
const MAX_TEMPLATE_ITEMS = 100;
const MAX_VISITS = 5000;
const ACTIONS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"];
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isContainer = (v) => v !== null && typeof v === "object";
const absent = (v) => v === undefined || v === null;

export class DataModelError extends Error {}

/** DataModel.parsePath: non-empty segments, ~1 → /, ~0 → ~; a forbidden segment throws. */
export function segments(path) {
  return path
    .split("/")
    .filter((raw) => raw.length > 0)
    .map((raw) => {
      const segment = raw.replace(/~([01])/g, (_, g) => (g === "1" ? "/" : "~"));
      if (FORBIDDEN.has(segment)) throw new DataModelError(`Forbidden path segment '${segment}' in path '${path}'.`);
      return segment;
    });
}

export function getValue(data, path) {
  if (path === "/" || path === "") return data;
  let current = data;
  for (const segment of segments(path)) {
    if (!isContainer(current)) return undefined;
    if (Array.isArray(current)) {
      if (!INDEX.test(segment) || Number(segment) >= current.length) return undefined;
      current = current[Number(segment)];
    } else if (Object.hasOwn(current, segment)) current = current[segment];
    else return undefined;
  }
  return current;
}

function index(path, segment, onArray) {
  if (onArray && !INDEX.test(segment))
    throw new DataModelError(`Cannot use non-numeric segment '${segment}' on an array in path '${path}'.`);
  if (Number(segment) > MAX_INDEX)
    throw new DataModelError(`Cannot set path '${path}': array index '${segment}' exceeds maximum supported index (${MAX_INDEX}).`);
  return Number(segment);
}
const fresh = (path, next) => (INDEX.test(next) ? (index(path, next, false), []) : {});

/** DataModel.set(path, value) on `data` (changed in place); returns the new root. */
export function setValue(data, path, value) {
  const parts = segments(path);
  if (parts.length === 0) return absent(value) ? {} : structuredClone(value);
  const last = parts.pop();
  if (absent(value) && getValue(data, path) === undefined) return data;
  if (absent(data)) data = {};
  else if (!isContainer(data))
    throw new DataModelError(`Cannot set path '${path}': the data model root is a primitive value.`);
  let current = data;
  parts.forEach((segment, i) => {
    const next = i < parts.length - 1 ? parts[i + 1] : last;
    const key = Array.isArray(current) ? index(path, segment, true) : segment;
    const child = Array.isArray(current) || Object.hasOwn(current, key) ? current[key] : undefined;
    if (!absent(child) && !isContainer(child))
      throw new DataModelError(`Cannot set path '${path}': segment '${segment}' is a primitive value.`);
    if (absent(child)) current[key] = fresh(path, next);
    current = current[key];
  });
  if (Array.isArray(current)) {
    const at = index(path, last, true);
    if (!absent(value)) current[at] = structuredClone(value);
    else if (at < current.length) current[at] = undefined;
  } else if (absent(value)) delete current[last];
  else current[last] = structuredClone(value);
  return data;
}

/** DataContext.resolvePath: absolute as is, relative below the context path. */
export function resolvePath(path, context = "/") {
  if (path.startsWith("/")) return path;
  let base = context.endsWith("/") && context.length > 1 ? context.slice(0, -1) : context;
  if (path === "" || path === ".") return base || "/";
  if (base === "/") base = "";
  return `${base}/${path}`;
}

export function target(message) {
  const actions = isObject(message) ? ACTIONS.filter((a) => a in message) : [];
  const body = actions.length === 1 ? message[actions[0]] : null;
  return isObject(body) && typeof body.surfaceId === "string" ? [body.surfaceId, actions[0], body] : [null];
}

/** Step 4 for one message; `reply` = { touched, changed, received } of the reply being merged. */
export function mergeMessage(state, reply, message, catalog, refs, problems) {
  const [sid, action, body] = target(message);
  if (sid === null) return;
  if (sid.trim() === "") return problems.push({ rule: "blank-surface-id", detail: JSON.stringify(sid) });
  if (action === "createSurface") {
    if (body.catalogId !== catalog.catalogId) problems.push({ rule: "unknown-catalog", detail: body.catalogId });
    if (state.has(sid)) problems.push({ rule: "create-twice", detail: sid });
    state.set(sid, { components: new Map(), data: {} });
    reply.changed.set(sid, []);
    reply.received.delete(sid);
  } else if (action === "deleteSurface") {
    state.delete(sid);
    reply.changed.delete(sid);
  } else {
    if (!state.has(sid)) {
      problems.push({ rule: "update-before-create", detail: sid });
      state.set(sid, { components: new Map(), data: {}, assumed: true });
    }
    const surface = state.get(sid);
    if (action === "updateComponents" && Array.isArray(body.components)) {
      const changed = reply.changed.get(sid) ?? [];
      reply.changed.set(sid, changed);
      if (body.components.length > 0) reply.received.add(sid);
      const seen = new Set();
      for (const comp of body.components) {
        if (!isObject(comp) || typeof comp.id !== "string" || comp.id === "") continue;
        if (seen.has(comp.id)) problems.push({ rule: "duplicate-id", detail: comp.id });
        seen.add(comp.id);
        const { catalogId: _c, metadata: _m, ...merged } = structuredClone(comp);
        const shown = surface.components.get(comp.id);
        if (!("component" in merged) && shown) merged.component = shown.component;
        surface.components.delete(comp.id);
        surface.components.set(comp.id, merged);
        changed.push(comp.id);
      }
      cycles(surface.components, refs, problems);
    } else if (action === "updateDataModel" && (body.path === undefined || typeof body.path === "string")) {
      try {
        surface.data = setValue(surface.data, body.path || "/", body.value);
      } catch (error) {
        if (!(error instanceof DataModelError)) throw error;
        problems.push({ rule: "data-path", detail: error.message });
      }
    }
  }
  reply.touched.add(sid);
}

/**
 * Component type → prop → kind, from the catalog's $refs to common_types Dynamic* (own + allOf props; `tabs[].title`
 * = `title` of every item of the literal array `tabs`) and the row lists (`Table.rows`: an array of objects).
 */
export function bindingKinds(catalog, propsOf) {
  const kindOf = (sub) => {
    const [base, def] = String(sub?.$ref ?? "").split("#/$defs/");
    return base.endsWith("/common_types.json") && Object.hasOwn(KINDS, def) ? KINDS[def] : undefined;
  };
  const kinds = new Map();
  for (const [name, schema] of Object.entries(catalog.components)) {
    const props = propsOf(schema);
    const own = [];
    for (const [prop, sub] of Object.entries(props)) {
      if (kindOf(sub)) own.push([prop, kindOf(sub)]);
      if (sub?.type !== "array") continue;
      for (const [key, item] of Object.entries(propsOf(sub.items))) if (kindOf(item)) own.push([`${prop}[].${key}`, kindOf(item)]);
    }
    for (const prop of ROW_LISTS[name] ?? []) if (Object.hasOwn(props, prop)) own.push([prop, ROW_KIND]);
    if (own.length > 0) kinds.set(name, new Map(own));
  }
  return kinds;
}

const bound = (v) => isObject(v) && Object.keys(v).length === 1 && typeof v.path === "string";
/** The {path} bindings of `comp` the kinds name: [label, path, kind]. */
const bindingsOf = (comp, kinds) =>
  [...kinds].flatMap(([key, kind]) => {
    const [prop, sub] = key.split("[].");
    if (sub === undefined) return bound(comp[prop]) ? [[prop, comp[prop].path, kind]] : [];
    if (!Array.isArray(comp[prop])) return [];
    return comp[prop].flatMap((item, i) => (bound(item?.[sub]) ? [[`${prop}[${i}].${sub}`, item[sub].path, kind]] : []));
  });
const misfit = (kind, held) =>
  !absent(held) && (kind === ROW_KIND ? !(Array.isArray(held) && held.every(isObject)) : isContainer(held));

const read = (data, path) => {
  try {
    return getValue(data, path);
  } catch {
    return undefined;
  }
};
const isTemplate = (v) => isObject(v) && typeof v.componentId === "string" && typeof v.path === "string";

/** Step 5 bound values: the renderer's instances from root (templates once per array item). */
export function checkBindings(surface, refs, kinds, problems) {
  const { components, data } = surface;
  if (!components.has("root")) return;
  const stack = [["root", "/"]];
  const seen = new Set();
  let visits = 0;
  while (stack.length > 0 && visits < MAX_VISITS) {
    const [cid, ctx] = stack.pop();
    const comp = components.get(cid);
    if (!comp || seen.has(`${cid}\u0000${ctx}`)) continue;
    seen.add(`${cid}\u0000${ctx}`);
    visits++;
    const type = typeof comp.component === "string" ? comp.component : undefined;
    for (const [label, path, kind] of bindingsOf(comp, kinds.get(type) ?? new Map())) {
      if (misfit(kind, read(data, resolvePath(path, ctx)))) problems.push({ rule: "bound-value", detail: `${cid}.${label}` });
    }
    const fields = fieldsOf(refs, type);
    const kids = [];
    for (const key of fields ? [...new Set([...fields.single, ...fields.lists])].toSorted() : []) {
      const value = comp[key];
      if (!isTemplate(value)) {
        kids.push(...pointers(value, fields.nested.get(key), []).map((id) => [id, ctx]));
        continue;
      }
      const listPath = resolvePath(value.path, ctx);
      const items = read(data, listPath);
      if (Array.isArray(items))
        for (let i = 0; i < Math.min(items.length, MAX_TEMPLATE_ITEMS); i++)
          kids.push([value.componentId, resolvePath(String(i), listPath)]);
      else if (!absent(items)) problems.push({ rule: "template-array", detail: `${cid}.${key} → ${listPath}` });
    }
    stack.push(...kids.toReversed());
  }
}
