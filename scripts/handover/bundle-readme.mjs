/**
 * SV-C23 / SV-C28: the generated handover/README.md: the file table and the validator recipe "Validating with only
 * this bundle" (steps 1–5). Every rule has an id (a validator-cases mutation name where one exists); the bundle's own
 * scripts/bundle-validator.mjs implements exactly these steps and scripts/run-cases.mjs proves it on every case.
 */

/** The name the A2UI envelope's relative `catalog.json` references resolve to (= the active catalog). */
export const SPEC_CATALOG_ALIAS = "https://a2ui.org/specification/v0_9/catalog.json";

/** Step 3: rules per message that JSON Schema cannot express (A3-09, A4-27, A4-29). */
export const MESSAGE_CHECKS = {
  "path-tilde": "every `path` / `@path` string anywhere is a relaxed JSON pointer: `~` only as `~0` / `~1`",
  "forbidden-segment":
    "no such `path` / `@path` has a segment (split on `/`, `~1` → `/`, `~0` → `~`) `__proto__`, `constructor` or " +
    "`prototype` (the renderer's data model throws on it while rendering)",
  "proto-key": "no object anywhere has a `__proto__` key (JavaScript drops it or reads it as the prototype)",
  "deep-calls": "function calls nest at most 5 deep (`{call|@call, args}` or `{functionCall}` inside another)",
  "deep-json": "no value is deeper than 50 levels (the message itself is level 1)",
  "empty-id": "every component has a non-empty string `id`",
  "component-catalog-other": "a component's string `catalogId` is this catalog's `catalogId`",
  "template-path":
    "a ChildList template `{componentId, path}` has a `path` other than `\"\"` and `\".\"` (those name the whole " +
    "data context, never an array)",
  "context-key-function":
    "every object anywhere below a component's properties whose `call` (else `function`) is a non-empty string is " +
    "a function call, whatever key holds it (an event `context` value, a binding, another call's `args`): its " +
    "name is a key of `catalog.json` `functions` (an own key: `toString` is no function), its `args` (missing or " +
    "`null` = `{}`, at most 1000 keys) is valid against that function's `args` schema (step 2 relaxed)",
};

/** Step 4: merging one reply into the chat's surfaces, message by message (SV-C28, A4-B01, A4-B02). */
export const MERGE_CHECKS = {
  "blank-surface-id": "every `surfaceId` is a string that is not empty or blank (JavaScript `trim()`)",
  "unknown-catalog": "`createSurface.catalogId` is this catalog's `catalogId`",
  "create-twice":
    "`createSurface` names a surface that is not shown: neither in the chat's state nor created by an earlier " +
    "message of the reply (to create it again, `deleteSurface` it first)",
  "update-before-create":
    "`updateComponents` / `updateDataModel` names a surface that is shown at that point: in the chat's state or " +
    "created by an earlier message of the reply, and not deleted since. No surface is ever assumed: a first reply " +
    "that only updates is invalid, and so is a message to a surface after its `deleteSurface` unless the reply " +
    "created it again",
  "duplicate-id": "component ids are unique within one `updateComponents`",
  "self-reference": "after every `updateComponents`, no component of the surface references itself",
  cycle: "after every `updateComponents`, walking from every component of the surface (id order) finds no cycle",
  "data-path":
    "every `updateDataModel` write is one the renderer's data model accepts (see the write rules below)",
};

/** Step 5: the merged state of every surface the reply touched that holds components (or received some). */
export const TREE_CHECKS = {
  "missing-root": "the surface has a component with id `root`",
  "dangling-child": "every child reference (`ComponentId`, `ChildList`, `Tabs.tabs[].child`) names a component of the surface",
  "tree-depth":
    "at most 50 levels below `root` (root = level 0; a child reference adds 1; first-visit depth): `root → n1 → … → " +
    "n50` passes, `n51` fails (the same limit applies to every start of step 4's walk)",
  orphan: "every component the reply changed is reachable from `root` (components it did not touch are not checked)",
  "bound-value":
    "walking from `root` as the renderer instantiates the tree (a template renders its component once per array " +
    "item, data context `<list path>/<index>`; at most 100 items per list and 5000 instances), no prop whose schema " +
    "is `DynamicString`, `DynamicNumber` or `DynamicBoolean` is bound with `{path}` (resolved against the context: " +
    "absolute as is, relative below it, `\"\"`/`\".\"` = the context) to an object or an array (also inside the " +
    "items of a literal array prop: `Tabs.tabs[].title`), and `Table.rows` is bound only to an array of objects " +
    "(or nothing yet)",
  "template-array": "in the same walk, a template's path holds an array, or nothing yet (absent / `null`)",
};

const list = (checks) =>
  Object.entries(checks)
    .map(([id, rule]) => `   - ${rule} (\`${id}\`)`)
    .join("\n");

const STATE = `
## Stateful validation per chat (SV-C28): a REQUIREMENT for production servers

A reply never stands alone: the page applies it to the surfaces it already shows. A production server MUST:

- keep each chat's surface state after every valid reply: per \`surfaceId\` its components (by id, each with its
  type) and its data model, deletes applied;
- check every new reply merged into a COPY of that state and validate the WHOLE merged state (steps 1–5 below), not
  the reply alone; valid → the copy becomes the chat's state; invalid → the state stays as it was and the exact
  problems go back to the agent (repair loop, then the fallback);
- when an action carries the surface's \`dataModel\`, replace that surface's data model with it before the check
  (it is the page's truth, inputs included);
- forget the state with the chat.

Optional (DEC-064): every \`ok\` answer may carry a \`turnId\`; a client that rejects such a reply after all (an
expression or render error, its own validator) sends its repair \`/prompt\` with \`repairOf\` = that \`turnId\`. A server
that supports it first rolls the chat's state back to before that turn (only the chat's latest turn, and only while
nothing changed the state since), then checks the repair against it; a server without it ignores the field.

A text-only reply (no A2UI messages) and a fallback leave the state as it was.
\`validator-cases/cases.json\` holds chats from an EMPTY state with the verdict of every step.
`;

const REPLIES = `
## Endpoints and replies (SV-C26, SV-C27)

- Required: \`POST {base}/prompt\` and \`POST {base}/action\`, both answering with \`contractVersion\`. Optional:
  \`/cancel\`, \`/progress\`, \`/models\`, \`/model\`, \`/health\`; the web package probes each once and a missing one
  never fails a chat (Cancel aborts the request on the client, no model choice, a plain working state).
- A reply is \`text\` + \`messages\`; the page always shows the text. A text-only reply (\`ok\`, \`messages: []\`) is
  normal. Text with a failed UI is \`fallback\` with the text and either \`fallback.json\` or \`messages: []\`.
- The reference server's modes (TOML \`[reply]\`): \`ui = "always" | "auto"\` (auto: a \`/prompt\` may be answered
  with text only; UI is required for an \`/action\` and a \`repairOf\` repair), \`fallback = "surface" | "text"\`,
  \`surfaces = "many" | "single"\`. Details: \`SERVER-CONTRACT.md\`.
`;

function validating() {
  return `
## Validating with only this bundle

1. JSON Schema 2020-12, offline: register \`schemas/common_types.json\` and \`catalog.json\`, the catalog also under
   \`${SPEC_CATALOG_ALIAS}\` (the URI the envelope's relative \`catalog.json\` refs resolve to), then validate every
   message against \`schemas/server_to_client.json\`. Nothing is fetched. A component of an \`updateComponents\`
   that has no \`component\` key and whose id the surface already holds is validated as that type (a partial update).
2. Relaxations, as the renderer judges (its Zod objects drop unknown keys except where the contract says strict):
   - in \`catalog.json\`, every \`additionalProperties: false\` / \`unevaluatedProperties: false\` below a component's
     top level (list items such as options, tabs, columns) and anywhere in \`functions\` is open; a component's own
     top level, the \`theme\` and every closure in \`schemas/\` stay closed;
   - every component also accepts \`catalogId\` and \`metadata\` (envelope keys, never checked by the schema; see
     step 3 for a string \`catalogId\`);
   - the keywords \`validator-cases/cases.json\` lists under \`jsonOnlyKeywords\` (function → \`args\` field, \`""\` =
     the \`args\` object → keywords) are dropped: the renderer does not check them;
   - v0.9 and v0.9.1 are one release line: every message's \`version\` \`const\` reads \`enum: ["v0.9", "v0.9.1"]\`;
   - a function call's \`returnType\` may be any value of the \`FunctionCall.returnType\` enum in
     \`schemas/common_types.json\`: read every \`returnType\` \`const\` (per function and per value slot) as that enum.
3. Rules per message (a message that breaks a nesting limit is invalid without steps 1, 2 and 4):
${list(MESSAGE_CHECKS)}
4. Merge the reply into a copy of the chat's state, message by message, as the renderer applies it:
   \`createSurface\` adds an empty surface (data model \`{}\`); \`deleteSurface\` removes the surface with its components
   and data and is never an error (deleting a surface that is not shown changes nothing); a component of an
   \`updateComponents\` replaces the component with that id (all its properties; without \`component\` it keeps the
   type shown); \`updateDataModel\` writes \`value\` at \`path\`. Rules:
${list(MERGE_CHECKS)}

   Data-model writes (\`data-path\`, web_core \`DataModel.set\`): \`path\` absent or \`""\` = \`/\`; \`value\` absent
   or \`null\` deletes (a key is removed, an array element becomes a hole; deleting what does not exist changes
   nothing and is never an error); \`/\` replaces the whole model (\`null\` → \`{}\`). Segments as in step 3; a
   forbidden segment is an error; on an array a segment must match \`^(0|[1-9][0-9]*)$\` (\`-\`, \`01\`, \`x\` are
   errors) and be at most 10000; writing below a string, number or boolean, or below a primitive root, is an error;
   a missing parent is created (an array when the next segment is an index, which is then at most 10000 too).
5. Checks of the merged state, for every surface the reply touched that holds components:
${list(TREE_CHECKS)}

A reply is valid when no step finds a problem. Every step of every case of \`validator-cases/cases.json\` gets its
\`expected.valid\` verdict this way (each case is one chat from an empty state; an invalid step leaves the state as
it was). \`scripts/bundle-validator.mjs\` is this validator, built from the bundle files alone
(\`bundleValidator(dir, require).chat().check(messages)\` → problems); \`scripts/run-cases.mjs\` runs it on every
case: \`npm install ajv@8 ajv-formats@3\` next to the bundle, then \`node scripts/run-cases.mjs\` (exit 0 = every
step agrees).
`;
}

export function readme(paths, catalogId) {
  const examples = paths.filter((path) => path.startsWith("examples/")).length;
  return `# agentic-ui hand-over bundle

<!-- Generated by pnpm build (scripts/handover/write.mjs in the agentic-ui repo). Do not edit. -->

Everything a production backend needs to serve the ui-kit-one contract (\`${catalogId}\`, A2UI v0.9).
The reference implementation is the agentic-ui agent server (agentic-ui-server.pyz).
When \`version\` in \`manifest.json\` changes, replace all files; there is no changelog.

| File | Content |
| --- | --- |
| \`catalog.json\` | the contract (single source): components, props, tokens, rules |
| \`system-prompt.md\` | the generated system prompt with few-shot examples |
| \`examples/*.json\` | ${examples} valid example payloads \`{name, description, messages}\` |
| \`fallback.json\` | the fixed "sorry" surface returned after the repair attempts are used up |
| \`validator-cases/\` | chats of replies with the expected verdict of every step for a production validator |
| \`SERVER-CONTRACT.md\` | HTTP API (required and optional endpoints), repair loop, cancel, fallback, SV-C28 |
| \`schemas/*.json\` | the A2UI v0.9 envelope (\`server_to_client.json\`) and \`common_types.json\` the catalog references |
| \`scripts/*.mjs\` | the validator of the recipe below (\`bundle-validator.mjs\` + helpers) and its case runner |
| \`manifest.json\` | version, catalogId, contract version, sha256 of every file |
${REPLIES}${STATE}${validating()}`;
}
