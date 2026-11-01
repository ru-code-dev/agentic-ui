/**
 * P4 validator referee: the @a2ui/agent 0.0.2 verdict on each payload, as scripts/validate.ts runs it, plus the
 * project rules (the catalog's src/project-rules.ts, the page store's own implementation; A4F, A5-01).
 * Usage: node apps/agent-server/tests/agreement/validator-referee.mjs <cases.json>   ([{ id, messages }])
 * Prints { refMap, results: [{ id, valid, error }] }: `validatePayload([uiKitOneContract], messages)` (= a
 * PayloadState: RendererState assuming unknown surfaces, apply + checkTopology) and the project rules throw on
 * the first problem (error = its message), the contract's componentRefMap (child reference fields per
 * component type) that the Python topology check must equal, and jsonOnly: per catalog function, the JSON Schema
 * keywords web_core's spec() annotation adds that its Zod object never checks (refs.py JSON_ONLY_KEYWORDS, A3-05).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const pkg = resolve(root, "packages/ui-kit-one-catalog");
const { RendererState } = await import(
  pathToFileURL(resolve(pkg, "node_modules/@a2ui/agent/src/index.js")).href
);
const { projectRules } = await import(pathToFileURL(resolve(pkg, "src/project-rules.ts")).href);
const { uiKitOneContract } = await import(pathToFileURL(resolve(pkg, "src/index.ts")).href);
// Not exported by the package; the same module URL the catalog entry point imports, so the same annotation map.
const { getSpecAnnotation } = await import(
  pathToFileURL(resolve(pkg, "node_modules/@a2ui/web_core/src/catalog/spec_annotations.js")).href
);

/** @a2ui/agent's own validatePayload state (utils/validation.js): a surface the payload only updates is assumed. */
class PayloadState extends RendererState {
  get assumesUnknownSurfaces() {
    return true;
  }
}
const rules = projectRules(
  JSON.parse(
    readFileSync(
      resolve(root, "apps/agent-server/src/agentic_ui_server/data/catalog.json"),
      "utf8",
    ),
  ),
);
/** One payload: project rules on the messages, apply + checkTopology, project rules on every non-assumed surface. */
function judge(messages) {
  try {
    new PayloadState([uiKitOneContract]).transaction((s) => {
      rules.checkMessages(messages);
      const touched = s.apply(messages);
      s.checkTopology(touched);
      for (const id of new Set(touched)) {
        const surface = s.getSurface(id);
        if (surface && !s.assumed.has(id)) rules.checkSurface(surface);
      }
    });
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: String(error?.message ?? error) };
  }
}
const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const results = cases.map(({ id, messages }) => Object.assign({ id }, judge(messages)));
const sorted = (set) => [...(set ?? [])].toSorted();
const refMap = Object.fromEntries(
  Object.entries(uiKitOneContract.componentRefMap)
    .map(([name, refs]) => [
      name,
      {
        single: sorted(refs.singleRefs),
        lists: sorted(refs.listRefs),
        nested: Object.fromEntries(
          Object.entries(refs.nestedRefs ?? {}).map(([key, keys]) => [key, sorted(keys)]),
        ),
      },
    ])
    .filter(([, refs]) => refs.single.length + refs.lists.length > 0),
);
const keywordsOf = (schema) => {
  let node = schema;
  let annotation = getSpecAnnotation(node);
  while (!annotation && node?._def?.innerType) {
    node = node._def.innerType;
    annotation = getSpecAnnotation(node);
  }
  return Object.keys(annotation?.keywords ?? {});
};
const jsonOnly = {};
for (const [name, fn] of uiKitOneContract.functions) {
  const fields = { "": keywordsOf(fn.schema) };
  for (const [key, field] of Object.entries(fn.schema.shape ?? {})) fields[key] = keywordsOf(field);
  const used = Object.entries(fields).filter(([, keywords]) => keywords.length > 0);
  if (used.length > 0) jsonOnly[name] = Object.fromEntries(used);
}
process.stdout.write(JSON.stringify({ refMap, jsonOnly, results }));
