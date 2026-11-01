# REMAP.md — agent guide: change, remap or swap the UI kit

For a coding agent that changes the kit side of agentic-ui. Each recipe lists the exact files, what regenerates and
the proof command. Every path, command and symbol named here is checked by `scripts/docs-refs.test.mjs`.
Rules and commands: [`AGENTS.md`](AGENTS.md). Done = `pnpm check` green and `git status --porcelain` empty.

## Proof (the same for every recipe)

1. `pnpm build`: regenerates everything a change affects — catalog `dist/` (catalog.json, system-prompt.md),
   `CONTRACTS.md`, `MAPPING.md`, the server data, `validator-cases/`, `fallback.json`, `SERVER-CONTRACT.md`
   (`scripts/server-generate.sh`), the pyz and `handover/` (version bump).
2. Stage your edits and every regenerated file with explicit paths (`git status` lists them):
   `pnpm run check:generated` compares with the staged copy, so a correct but unstaged regeneration reads "stale".
3. `pnpm check` (runs `pnpm build` again, then `check:generated`; fix every failure).

A recipe's "focused" test is a quick loop while editing, not a replacement for these three steps.

## Kickoff prompt (copy-paste)

```text
You change the UI kit side of the agentic-ui repo (pnpm monorepo, A2UI v0.9 catalog + Chakra v1 renderer).
First read AGENTS.md, REMAP.md and packages/ui-kit-one-react/MAPPING.md. Task: <one recipe from REMAP.md and the
concrete component/prop/token>. Follow the recipe's file list exactly; edit only hand-written files, never the
generated ones (dist/, CONTRACTS.md, MAPPING.md, apps/agent-server/src/agentic_ui_server/data/, handover/).
Shell: `. scripts/workflow-env.sh` first; everything stays inside the repo. After the edit run the Proof steps of
REMAP.md (`pnpm build`, stage the edits and the regenerated files, `pnpm check`); fix every failure (do not skip
tests, do not weaken checks). Commit with explicit
pathspecs including the regenerated files. Report: files changed, commands run, pass counts.
```

## How the kit is wired

- `packages/ui-kit-one-catalog/src/components/<name>.ts`: the contract of one component (prop names and values are
  the kit's own names, DEC-005); `packages/ui-kit-one-catalog/src/tokens/<group>.ts`: the model-facing token lists.
- `packages/ui-kit-one-react/src/kit/<name>.ts`: a typed facade per kit component —
  `ComponentType<Pick<KitProps, ...>>`. **The facades are the exact surface a fork must provide** (the props the
  renderer passes); `src/kit/index.ts` is the only import point for the rest of the renderer (lint-enforced as an
  allowlist, `agentic-ui/kit-boundary` in `.oxlintrc.json`: outside `src/kit/` only its own files, `react`, `@a2ui/*`,
  `@agentic-ui/*` and `zod`, so a fork under any package name is blocked there with no lint edit; A4b-R1).
- `packages/ui-kit-one-react/src/registry.ts`: `COMPONENT_REGISTRY` = `PASSTHROUGH`
  (`src/passthrough-components.ts`, one `passthrough(Api, KitComponent, "KitName", options?)` line per pure-data
  component) + custom entries (`src/components/<name>.tsx`, each exporting the component and its `mapping`).
- Chakra patches: `patches/*.patch`, pinned by exact version in `pnpm-workspace.yaml` `patchedDependencies`
  (`@chakra-ui/react@1.8.9`, modal, portal, toast). A fork at another version needs them dropped or re-created.

## Recipe 1 — swap the kit import (fork with the same API)

| Before                                                                                                                                                                | After                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `"@chakra-ui/react": "1.8.9"` in `packages/ui-kit-one-react/package.json` and `packages/a2ui-react/package.json` (dev + peer each) and `apps/playground/package.json` | `"@chakra-ui/react": "npm:<fork-package>@<version>"` (alias: no source edits) — or the fork's name in every `src/kit/*.ts` import       |
| `patchedDependencies` in `pnpm-workspace.yaml`                                                                                                                        | remove the four Chakra lines (and `patches/*.patch`) or re-create them: `pnpm patch <pkg>@<version>` → edit → `pnpm patch-commit <dir>` |

Regenerates: `pnpm-lock.yaml` (`pnpm install`). Passthrough components need no change when the fork accepts the
same props. The `packages/a2ui-react` peer (`^1.8.0`) is what a consumer of the packed tarball must satisfy: a fork
with another package name or major version needs that peer changed too, or `npm install` stops with `ERESOLVE`. Proof: `pnpm install && pnpm typecheck && pnpm test && pnpm e2e`, then `pnpm check` (the scoped-parity
and components smoke e2e specs render every component through the fork).

## Recipe 2 — remap one component onto the owner's custom kit component

| File                                                                      | Change                                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-kit-one-react/src/kit/<name>.ts`                             | import the owner's component; keep the `Pick<...>` list = the props the contract passes                               |
| `packages/ui-kit-one-react/src/passthrough-components.ts`                 | unchanged when the owner's props/values equal the contract's; else add `values` / `fixed` options (recipes 5, 6)      |
| `packages/ui-kit-one-react/src/registry.ts` + `src/components/<name>.tsx` | only when the props need translation: move the line from `PASSTHROUGH` to the custom entries (one-line swap, DEC-007) |

Regenerates: `packages/ui-kit-one-react/MAPPING.md` only when the `values` / `fixed` options or a custom mapping
change; it names the facade, not the package the facade imports (A4b-R6). Proof: `pnpm build`, stage, `pnpm check`; focused:
`pnpm --filter @agentic-ui/ui-kit-one-react test` (`packages/ui-kit-one-react/tests/registry.test.ts` fails while
registry and contract disagree; `apps/playground/e2e/components-smoke.spec.ts` renders `/components/<Name>`).

## Recipe 3 — rename or reshape a prop (e.g. Avatar `name` → `firstName` + `lastName`)

| File                                                                                                       | Change                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-kit-one-catalog/src/components/avatar.ts`                                                     | replace the prop (keep a `prop.*` kind + description on each)                                                                                                                                   |
| `packages/ui-kit-one-react/src/kit/avatar.ts`                                                              | the facade's `Pick<AvatarProps, ...>` list, only when the kit component itself takes the new props; otherwise the facade keeps the kit's props and row 4's custom component translates (A4b-R2) |
| every example using the component: `grep -rl '"component": "Avatar"' packages/ui-kit-one-catalog/examples` | the new props, plus the data-model paths they bind to                                                                                                                                           |
| `packages/ui-kit-one-react/src/passthrough-components.ts` or `src/registry.ts`                             | nothing when the kit component accepts the new props; else passthrough → custom (recipe 2)                                                                                                      |

Regenerates: `catalog.json`, `system-prompt.md`, `CONTRACTS.md`, `MAPPING.md`, server data (incl.
`contract-version.json`), both `SERVER-CONTRACT.md` (the `contractVersion` of their examples), `handover/` (its
`version` bumps); `pnpm build` stops on an example the new contract rejects. Proof: `pnpm build`, stage, `pnpm check`; focused: `pnpm validate && pnpm test`.

## Recipe 4 — expose only a subset of a kit prop's values (no wrapper)

| File                                                                                                           | Change                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui-kit-one-catalog/src/components/<name>.ts`                                                         | `pickTokens(controlSizes, ["sm", "md"])` instead of the full list (`pickTokens` from `src/tokens/names.ts`, exported by the package)                         |
| every example and `apps/agent-server/src/agentic_ui_server/conversation/fallback.py` that uses a dropped value | a value the subset keeps: `pnpm validate` and the build name them (`N example(s) invalid …`, `the fallback (conversation/fallback.py) is invalid …`, A4b-R3) |

Passthrough stays unchanged: subset values are kit values. Proof: `pnpm build`, stage, `pnpm check`; focused:
`packages/ui-kit-one-catalog/tests/pick-tokens.test.ts`.

## Recipe 5 — rename or merge values (no wrapper)

| File                                                                                                                                   | Change                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-kit-one-catalog/src/components/<name>.ts`                                                                                 | the contract's value names (e.g. `neutral`, `success`)                                                                  |
| `packages/ui-kit-one-react/src/passthrough-components.ts`                                                                              | `passthrough(Api, Kit, "Kit", { values: { colorScheme: { neutral: "gray", success: "green" } } })`                      |
| every example `pnpm validate` names (`Invalid enum value. Expected <new values>`; values outside the map, e.g. `red`, are invalid too) | the new value names (`pnpm build` stops too: "validator_cases: N example(s) invalid against the contract, not written") |

The value map is applied at runtime and written into `MAPPING.md`. The kit types accept any string for style props,
so targets are checked against the kit theme instead: `packages/ui-kit-one-react/tests/value-targets.test.ts` fails on a
`colorScheme` target or unmapped value that is not a palette of the provider's theme (A4b-R4).
A test that pins example values needs the new names too (`packages/ui-kit-one-catalog/tests/prompt-examples.test.ts`,
`21-order-statuses`).
Proof: `pnpm build`, stage, `pnpm check` (`pnpm run docs` alone stops with "Run `pnpm build` first" while the
catalog `dist/` is older than its `src/`); focused: `pnpm validate` and
`packages/ui-kit-one-react/tests/passthrough-options.test.tsx`.

## Recipe 6 — fixed kit props the contract hides (no wrapper)

Two files: `packages/ui-kit-one-react/src/kit/<name>.ts` (add the hidden kit prop to the facade's `Pick<...>` list)
and `packages/ui-kit-one-react/src/passthrough-components.ts`
(`passthrough(Api, Kit, "Kit", { fixed: { <kitProp>: <value> } })`, e.g. Avatar `{ fixed: { showBorder: true } }`):
always set, never visible to the model, written into `MAPPING.md`. A fixed key missing from the facade fails
`pnpm typecheck` with a TS2322 naming the key and the fix (`fixed key "showBorder" is not a prop of the kit facade: add
it to the facade's Pick<...> list (src/kit/)`, A3-28); a fixed key that is also a contract prop fails with
`TS2554: Expected 5 arguments, but got 4` (its named message does not surface). Proof: `pnpm build`, stage,
`pnpm check`.

## Recipe 7 — add a component

A pure-data component with a new kit facade touches exactly 9 hand-written files (measured: Badge added in a
scratch copy, `pnpm check` green); everything else regenerates or derives its list from the contract
(`COMPONENT_APIS`, the registry, `examples/components/`). `scripts/component-files.test.mjs` pins this table.

| File                                                                | Change                                                             | Why                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `packages/ui-kit-one-catalog/src/components/<name>.ts` (new)        | `<Name>Api` (props with `prop.*` kinds and descriptions, SV-C22)   | the contract                                           |
| `packages/ui-kit-one-catalog/src/components/index.ts`               | import + named export, `COMPONENT_APIS` (order), `COMPONENT_ROLES` | contract order; the role drives the generated rules    |
| `packages/ui-kit-one-catalog/src/index.ts`                          | `<Name>Api` in the explicit export list                            | DEC-050: every public name is listed                   |
| `packages/ui-kit-one-catalog/tests/public-api.test.ts`              | `<Name>Api` in `BEFORE_ENTRY`                                      | DEC-050 public-API proof (deliberate, fails until set) |
| `packages/ui-kit-one-catalog/examples/components/<Name>.json` (new) | the snippet                                                        | every component needs a validated example              |
| `packages/ui-kit-one-react/src/kit/<name>.ts` (new)                 | the facade `ComponentType<Pick<KitProps, ...>>`                    | the only place that imports the kit                    |
| `packages/ui-kit-one-react/src/kit/index.ts`                        | its named export                                                   | DEC-050 (the kit barrel)                               |
| `packages/ui-kit-one-react/tests/public-api.test.ts`                | the kit name in `BEFORE_KIT`                                       | DEC-050 public-API proof (deliberate)                  |
| `packages/ui-kit-one-react/src/passthrough-components.ts`           | one `passthrough(...)` line, anywhere (lookup is by name)          | pure data: the registry takes it from `PASSTHROUGH`    |
| `packages/ui-kit-one-react/src/components/<name>.tsx` (new)         | custom component + its `mapping` — instead of the passthrough line | only when props need translation                       |
| `packages/ui-kit-one-react/src/registry.ts`                         | one `CUSTOM` line — with the custom component                      | DEC-007 single registry                                |
| `packages/ui-kit-one-react/tests/behaviour.test.tsx`                | a gesture in `GESTURES` per new two-way / action / trigger prop    | the generated behaviour test fails naming the prop     |

A kit component that already has a facade skips `src/kit/<name>.ts`, `src/kit/index.ts` and `BEFORE_KIT` (6 files);
a custom component replaces the passthrough line by its file + the registry line (10 files). Needs no edit: the
component counts and lists of the unit, script and e2e tests (`apps/playground/e2e/support/contract.ts`), the
snippet test's `EXPECTED` map (optional; a new snippet gets the generic render check), the `/components` page, the
order of the passthrough lines (`packages/ui-kit-one-react/tests/mapping.test.ts` compares names, A3-27), the
State-colours rule test for a `status` component (`packages/ui-kit-one-catalog/tests/catalog-rules.test.ts` derives
it from `COMPONENT_ROLES` and each component's own `colorScheme` values, A3-26).
Regenerates: everything of recipe 3, plus `handover/examples/<Name>.json`, the validator cases
(`apps/agent-server/validator-cases/cases.json`, `handover/validator-cases/cases.json`) and `handover/README.md` (A4-D03). Proof: `pnpm build`, stage, `pnpm check`;
focused: `pnpm validate && pnpm test`.

## Recipe 8 — change or expose tokens

Edit `packages/ui-kit-one-catalog/src/tokens/<group>.ts` (e.g. `src/tokens/colors.ts`, `src/tokens/space.ts`); when a
value is dropped, also every example and `apps/agent-server/src/agentic_ui_server/conversation/fallback.py` that uses
it (`pnpm validate` and the build name them, A4b-R3).
The renderer theme is not built from these files (DEC-042): the owner's provider carries all tokens; the files
expose the subset the model may use. **Nothing checks a new token against the owner's theme** (DEC-043: the
owner's kit maps tokens to its own CSS variables): before exposing e.g. `radii` `4xl`, make sure the owner's theme
defines it, or the model may pick a value that renders as the kit's fallback. Regenerates: `catalog.json` and the prompt (rules
included), `CONTRACTS.md`, server data (incl. `contract-version.json`), both `SERVER-CONTRACT.md` (the
`contractVersion` of their examples), `handover/` (version bump); validator cases only when an example's verdict or
errors change. Proof: `pnpm build`, stage, `pnpm check`;
focused: `pnpm validate`.

## Recipe 9 — plug the owner's provider / theme

| File                                                 | Change                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui-kit-one-react/src/kit/theme.ts`         | re-export the fork's theme primitives (`extendTheme`, `ThemeProvider`, `GlobalStyle`, ...) and its theme object          |
| `packages/ui-kit-one-react/src/kit/index.ts`         | the theme object's name in the explicit export list (DEC-050; the provider imports only from here)                       |
| `packages/ui-kit-one-react/tests/public-api.test.ts` | the same name in `BEFORE_KIT` (DEC-050 public-API proof, deliberate)                                                     |
| `packages/ui-kit-one-react/src/kit/providers.ts`     | the fork's `IdProvider`, `DarkMode`, `LightMode`                                                                         |
| `packages/ui-kit-one-react/src/provider.tsx`         | `const theme = extendTheme(..., ownerTheme)`: start from the owner's theme; `PAGE_BACKGROUND` follows its dark `body.bg` |

Give the owner's theme object an explicit type where it is declared (e.g. `export const ownerTheme: Record<string,
unknown> = extendTheme({...})`, or the fork's exported theme type): an inferred Chakra theme type fails the d.ts
build of `pnpm build` with TS2883 ("the inferred type … cannot be named"). `page-background.test.tsx` reads the
provider's own theme (`KIT_THEME`), so it follows the owner's `body.bg` with no edit. `UiKitProvider` keeps both
modes: `document` (whole page) and `scoped` (inside `[data-ui-kit-root]`, no global styles). Proof: `pnpm build`, stage, `pnpm check`; focused: `pnpm test`
(`packages/ui-kit-one-react/tests/page-background.test.tsx`) and `pnpm e2e`
(`apps/playground/e2e/scoped-parity.spec.ts`: scoped render pixel-equal to the document render), then `pnpm check`.

## Recipe 10 — a second kit with its own contract (`ui-kit-two`)

Copy `packages/ui-kit-one-catalog` and `packages/ui-kit-one-react` to `-two` packages, rename the package names
and the `catalogId` (`packages/ui-kit-one-catalog/src/catalog-id.ts`), apply recipes 1–9 there. There is no single registration point: the server bundles one catalog (point the imports
of `apps/agent-server/scripts/server-data.mjs` at the `-two` catalog package and build a second pyz;
`scripts/handover/bundle.mjs` (`EXAMPLES`) and the agreement tests under `apps/agent-server/tests/` name
`packages/ui-kit-one-catalog` too), and the playground imports `@agentic-ui/ui-kit-one-*` directly
(`git grep -l ui-kit-one apps/playground`, incl. `apps/playground/vite.config.ts` for the contract version): switch
those imports or add a second app. The web package `packages/a2ui-react` bundles the ui-kit-one catalog and renderer
(`git grep -l ui-kit-one packages/a2ui-react`, incl. `tsdown.config.ts` for the contract version): a second kit
needs a second package (or those imports switched).
Proof: `pnpm install && pnpm check`.

## Troubleshooting

- "expected string" or old errors after a contract change: an old `/preview` tab — the workspace says
  "Stale preview tab — reload it"; reload or close it.
- The editor still shows old JSON: the editor content is kept in localStorage — "Reset all" in the workspace.
- `vp build` fails with "stale workspace build": run `pnpm build` (a package `dist` is older than its `src`).
- "Failed to initialize cache: unable to open database file": `node --no-warnings scripts/vp-cache-heal.mjs`.
- `pnpm run check:generated` names a file: run `pnpm build` and stage the regenerated files (it compares with the
  staged copy: "stage the regenerated file" means the file on disk is already fresh).
