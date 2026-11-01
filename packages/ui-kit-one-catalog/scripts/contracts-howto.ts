/** The "How to change the contract" section of CONTRACTS.md (DEC-034). */
export const HOW_TO_COMPONENT = `## How to add or change a component

A component is described once; everything else is generated (catalog.json, system-prompt.md, catalog rules, Interactions, CONTRACTS.md, MAPPING.md). \`pnpm check\` fails when a generated file is stale (\`check:generated\`).

| Step | File | What |
|---|---|---|
| 1. Schema | \`packages/ui-kit-one-catalog/src/components/<name>.ts\` (new) | Zod schema; wrap every prop in its kind: \`prop.style(group, tokens, text)\`, \`prop.option\`, \`prop.content\`, \`prop.twoWay\`, \`prop.child\`, \`prop.trigger\`, \`prop.action\`, \`checksProp\` (\`src/prop-kinds.ts\`); \`.describe()\` the component, every prop and every item field. |
| 2. Register | \`packages/ui-kit-one-catalog/src/components/index.ts\` | import and named export, the API in \`COMPONENT_APIS\` and its role in \`COMPONENT_ROLES\`. |
| 2b. Public API | \`packages/ui-kit-one-catalog/src/index.ts\` + \`tests/public-api.test.ts\` | \`<Name>Api\` in the explicit export list and in \`BEFORE_ENTRY\` (DEC-050: every public name is listed). |
| 3. Mapper | \`packages/ui-kit-one-react/src/passthrough-components.ts\` | pure kit data: one \`PASSTHROUGH\` line. Needs translation instead: \`src/components/<name>.tsx\` (new) + one \`CUSTOM\` line in \`src/registry.ts\`. The registry is the only renderer list (DEC-007); implementations and MAPPING.md derive from it. |
| 3b. Kit facade | \`packages/ui-kit-one-react/src/kit/<name>.ts\` + its export in \`src/kit/index.ts\` and \`BEFORE_KIT\` in \`tests/public-api.test.ts\` | only when the kit component is not wrapped yet (the only place that imports the kit; DEC-050). |
| 4. Example | \`packages/ui-kit-one-catalog/examples/components/<Name>.json\` (new) | one valid snippet (required by the tests). |
| 5. Regenerate | \`pnpm build\` | catalog.json, prompt, rules, Interactions, CONTRACTS.md, MAPPING.md, server data, validator cases, hand-over bundle; stage them, then \`pnpm check\`. |

Measured: 9 hand-written files for a pure-data component with a new kit facade (steps 1–4), 6 when the kit component already has a facade, 10 for a custom renderer (its file and a \`CUSTOM\` line in \`src/registry.ts\` instead of the \`PASSTHROUGH\` line); a new two-way, action or trigger prop also needs a gesture in \`packages/ui-kit-one-react/tests/behaviour.test.tsx\`. The exact list is REMAP.md recipe 7, pinned by \`scripts/component-files.test.mjs\`. Missing pieces fail fast: no kind or description → the contract module throws (\`src/contract-checks.ts\`), no role → \`createContract\` throws, no renderer entry → \`src/registry.ts\` throws, no example → tests fail.

## How to expose part of a kit prop (no wrapper)

Three cases need no custom component (DEC-046); each is checked against the kit facade's prop types at compile time and follows into catalog.json, the prompt and MAPPING.md on regenerate.

| Case | Files | How |
|---|---|---|
| Value subset (e.g. only \`sm\`, \`md\`, \`lg\`) | 1: \`packages/ui-kit-one-catalog/src/components/<name>.ts\` | \`prop.style(group, pickTokens(sourceTokens, ["sm", "md", "lg"]), text)\` (\`pickTokens\` from \`src/tokens/names.ts\`; \`z.enum(pickTokens(…))\` for an option prop). A picked value outside the source list does not compile; the \`PASSTHROUGH\` line stays unchanged and passes the value through. |
| Renamed or merged values | 2: the schema file (the contract's own values) + its line in \`packages/ui-kit-one-react/src/passthrough-components.ts\` | \`passthrough(Api, Kit, "Kit", { values: { prop: { contractValue: "kitValue" } } })\`: applied when rendering and listed in MAPPING.md; every target must be a kit value, every source a contract value, unlisted values must be kit values. |
| Fixed hidden kit prop (e.g. always \`size="md"\`) | 1: its line in \`packages/ui-kit-one-react/src/passthrough-components.ts\` | \`passthrough(Api, Kit, "Kit", { fixed: { size: "md" } })\`: the prop is not in the contract, always rendered with that value, and listed in MAPPING.md; the value must be a kit value and the prop must not be a contract prop. |

Then \`pnpm build\`. Proof: tests/pick-tokens.test.ts (catalog), tests/passthrough-options.test.tsx (renderer).

## How to change tokens

The token files \`packages/ui-kit-one-catalog/src/tokens/*.ts\` are the hand-edited source of the contract: they expose a subset of the kit theme to the model. Edit a value or add/remove a key there, then \`pnpm build\`: the enums in catalog.json, the prompt, CONTRACTS.md and the rules follow. The renderer's kit maps the tokens to its own theme; \`check:generated\` fails while any generated file is stale.

A missing kind or description makes the contract module throw (\`src/contract-checks.ts\`), so a half-described component cannot be built. Renaming or re-kinding a prop changes the generated rules and Interactions automatically (tests/catalog-rules.test.ts, tests/add-component.test.ts).`;
