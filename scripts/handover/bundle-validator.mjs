/**
 * SV-C23 / A3-09 / SV-C28: the production validator handover/README.md "Validating with only this bundle" describes,
 * built from the bundle files alone (no @a2ui/* code; ajv + ajv-formats for JSON Schema): JSON Schema with the
 * README's relaxations (steps 1–2), the per-message rules (step 3), the merge of a reply into the chat's surfaces
 * (step 4) and the checks of the merged state (step 5). `bundleValidator(dir, require).chat()` → `{ check(messages)
 * → [{ rule, detail }] }`: one chat from an empty state; a valid reply (no problem) becomes the chat's state, an
 * invalid one leaves it as it was. `rule` is "schema" or the README rule id. Shipped in the bundle (scripts/);
 * scripts/run-cases.mjs runs it on every validator case.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bindingKinds, checkBindings, DataModelError, mergeMessage, segments, target } from "./bundle-state.mjs";
import { fieldsOf, propsOf, refMap, tree } from "./bundle-topology.mjs";

export const SPEC = "https://a2ui.org/specification/v0_9/";
const COMMON = `${SPEC}common_types.json`;
const RETURN_TYPES = `${COMMON}#/$defs/FunctionCall/properties/returnType`;
const ENVELOPE_KEYS = new Set(["id", "component", "catalogId", "metadata"]);
const SEGMENT = "(?:[^~/]|~[01])";
const RELAXED_PATH = new RegExp(`^(?:(?:/${SEGMENT}*)*|${SEGMENT}+(?:/${SEGMENT}*)*)$`, "u");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Step 2: version / returnType enums, Zod strip mode below a component's top level and in functions. */
function relaxVersions(node) {
  if (Array.isArray(node)) return node.map(relaxVersions);
  if (!isObject(node)) return node;
  const out = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, relaxVersions(value)]));
  if (out.properties?.version?.const !== undefined) out.properties.version = { enum: ["v0.9", "v0.9.1"] };
  if (out.properties?.returnType?.const !== undefined) out.properties.returnType = { $ref: RETURN_TYPES };
  return out;
}
function openClosures(node) {
  if (Array.isArray(node)) node.forEach(openClosures);
  if (!isObject(node)) return;
  for (const key of ["additionalProperties", "unevaluatedProperties"]) if (node[key] === false) delete node[key];
  Object.values(node).forEach(openClosures);
}
export function relaxedCatalog(catalog, jsonOnly) {
  const out = relaxVersions(catalog);
  for (const component of Object.values(out.components)) {
    for (const [key, part] of Object.entries(component)) if (key !== "unevaluatedProperties") openClosures(part);
    component.properties = { ...component.properties, catalogId: true, metadata: true };
  }
  for (const [name, fn] of Object.entries(out.functions)) {
    openClosures(fn);
    for (const [field, keywords] of Object.entries(jsonOnly[name] ?? {})) {
      const node = field === "" ? fn.properties.args : fn.properties.args.properties[field];
      for (const keyword of keywords) delete node[keyword];
    }
  }
  return out;
}

function forbidden(path, problems) {
  try {
    segments(path);
  } catch (error) {
    if (!(error instanceof DataModelError)) throw error;
    problems.push({ rule: "forbidden-segment", detail: path });
  }
}
/** Step 3a: nesting, path and key rules of one message (the message is level 1). */
function messageRules(message, problems) {
  const stack = [[message, 1, 0]];
  let deep = false;
  let calls = false;
  while (stack.length > 0) {
    const [item, depth, nested] = stack.pop();
    if (depth > 50) {
      deep = true;
      continue;
    }
    if (Array.isArray(item)) item.forEach((x) => stack.push([x, depth + 1, nested]));
    if (!isObject(item)) continue;
    if (Object.hasOwn(item, "__proto__")) problems.push({ rule: "proto-key", detail: "__proto__" });
    for (const key of ["path", "@path"]) {
      if (typeof item[key] !== "string") continue;
      if (!RELAXED_PATH.test(item[key])) problems.push({ rule: "path-tilde", detail: item[key] });
      else forbidden(item[key], problems);
    }
    const deeper = isObject(item.functionCall) || Array.isArray(item.functionCall)
      ? "functionCall"
      : ("call" in item || "@call" in item) && "args" in item ? "args" : null;
    if (deeper && nested >= 5) {
      calls = true;
      continue;
    }
    for (const [key, value] of Object.entries(item)) stack.push([value, depth + 1, key === deeper ? nested + 1 : nested]);
  }
  if (deep) problems.push({ rule: "deep-json", detail: "depth > 50" });
  if (calls) problems.push({ rule: "deep-calls", detail: "function call depth > 5" });
  return deep || calls;
}

/** Step 3b: one component's id, catalogId, template paths and nested function calls. */
function componentRules(comp, catalog, refs, argsValidator, problems) {
  if (!isObject(comp)) return;
  if (typeof comp.id !== "string" || comp.id === "") return problems.push({ rule: "empty-id", detail: comp.component });
  if (typeof comp.catalogId === "string" && comp.catalogId !== catalog.catalogId)
    problems.push({ rule: "component-catalog-other", detail: comp.catalogId });
  const fields = fieldsOf(refs, comp.component);
  for (const key of fields ? [...fields.lists].toSorted() : []) {
    const value = comp[key];
    if (isObject(value) && typeof value.componentId === "string" && (value.path === "" || value.path === "."))
      problems.push({ rule: "template-path", detail: `${comp.id}.${key}` });
  }
  const stack = Object.entries(comp).filter(([key]) => !ENVELOPE_KEYS.has(key)).map(([, value]) => value);
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) stack.push(...value);
    if (!isObject(value)) continue;
    const name = value.call ?? value.function;
    if (typeof name === "string" && name !== "") {
      const args = value.args ?? {};
      const fn = Object.hasOwn(catalog.functions, name) ? catalog.functions[name] : undefined;
      if (!fn) problems.push({ rule: "context-key-function", detail: `unknown function ${name}` });
      else if (isObject(args) && Object.keys(args).length > 1000)
        problems.push({ rule: "context-key-function", detail: `${name}: too many args` });
      else if (!argsValidator(name)(args)) problems.push({ rule: "context-key-function", detail: `${name} args` });
    }
    stack.push(...Object.values(value));
  }
}

export function bundleValidator(dir, require) {
  const read = (path) => JSON.parse(readFileSync(join(dir, path), "utf8"));
  const { Ajv2020 } = require("ajv/dist/2020.js");
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  require("ajv-formats").default(ajv);
  const raw = read("catalog.json");
  const catalog = relaxedCatalog(raw, read("validator-cases/cases.json").jsonOnlyKeywords);
  ajv.addSchema(relaxVersions(read("schemas/common_types.json")));
  ajv.addSchema({ ...catalog, $id: `${SPEC}catalog.json` });
  const message = ajv.compile(relaxVersions(read("schemas/server_to_client.json")));
  const args = (name) => ajv.getSchema(`${SPEC}catalog.json#/functions/${name}/properties/args`);
  const refs = refMap(catalog);
  const kinds = bindingKinds(catalog, propsOf);
  /** A component update that names no type is checked as the type its surface already holds (web_core). */
  const typed = (m, state) => {
    const [sid, action] = target(m);
    const shown = action === "updateComponents" ? state.get(sid)?.components : undefined;
    if (!shown || !Array.isArray(m.updateComponents.components)) return m;
    const components = m.updateComponents.components.map((c) =>
      isObject(c) && !("component" in c) && typeof c.id === "string" && shown.has(c.id)
        ? { ...c, component: shown.get(c.id).component }
        : c,
    );
    return { ...m, updateComponents: { ...m.updateComponents, components } };
  };
  /** Steps 3–5 for one reply, merged into `state` (changed in place). */
  const checkReply = (state, list) => {
    const problems = [];
    const reply = { touched: new Set(), changed: new Map(), received: new Set() };
    for (const raw of list) {
      if (messageRules(raw, problems)) continue;
      const m = typed(raw, state);
      if (!message(m)) problems.push({ rule: "schema", detail: JSON.stringify(message.errors?.[0]) });
      const components = m?.updateComponents?.components;
      for (const comp of Array.isArray(components) ? components : []) componentRules(comp, catalog, refs, args, problems);
      mergeMessage(state, reply, raw, catalog, refs, problems);
    }
    for (const sid of reply.touched) {
      const surface = state.get(sid);
      if (!surface || surface.assumed || (surface.components.size === 0 && !reply.received.has(sid))) continue;
      tree(surface.components, reply.changed.get(sid) ?? [], refs, problems);
      checkBindings(surface, refs, kinds, problems);
    }
    return problems;
  };
  return {
    /** One chat from an empty state (SV-C28). */
    chat() {
      let state = new Map();
      return {
        check(messages) {
          const draft = structuredClone(state);
          const problems = checkReply(draft, Array.isArray(messages) ? messages : [messages]);
          if (problems.length === 0) state = draft;
          return problems;
        },
        get surfaces() {
          return state;
        },
      };
    },
  };
}
