# SPEC — agentic-ui (A2UI catalog + Chakra v1 renderer + playground)

Single source of truth. Every agent reads this fully before working.
Changes to this file are made only by the orchestrator and logged in `docs/DECISIONS.md`.

---

## 0. Rules (non-negotiable)

- R1. **Zero bail-out.** Every intent (`INT-*`) ships, or a *better* alternative ships. An alternative must be recorded in the step report under `deviations_from_spec` with `why_better`. Nothing is "deferred", "skipped", "out of scope", or "TODO".
- R2. **Proof, not claims.** Every intent maps to evidence: a test (file + test name) and/or a screenshot path. Final evidence lives in `COVERAGE.md` (intent matrix).
- R3. No `.skip`, `.only`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`/`oxlint-disable` without a one-line justification comment. No `any` unless unavoidable and commented.
- R4. **One commit per step** (and per fix cycle). Conventional commit message. Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  Never push. Never rewrite history.
- R5. **Report per step**, zero prose, format in §12.
- R6. Never edit generated files by hand (`dist/`, `catalog.json`, `CONTRACTS.md`, generated prompt).
- R7. Code reads like a production library: small files, clear names, no dead code, no speculative abstractions, no commented-out code.
- R8. If blocked by something only a human can do (e.g. `sudo` for Playwright system libs), stop and report the exact command. Do not work around it by weakening proof.
- R9. Reference material is **read-only**:
  - `/tmp/a2ui-research/a2ui` — A2UI repo (spec, `@a2ui/web_core`, `@a2ui/react`, `@a2ui/agent` sources)
  - `/tmp/a2ui-research/composer` — Google A2UI Composer (UX reference for playground; not a dependency)
  - `/Users/user/WORKSPACE/Projects/Qwen/t3-ru-code/ru-code-packages` — tooling reference (pnpm, vite-plus, tsgo, tsdown, oxlint, oxfmt, tsconfig)
  - `/Users/user/WORKSPACE/Projects/Qwen/t3-ru-code/ru-code/apps/web` — playground UI stack reference (`@base-ui/react`, shadcn `base-mira` + `@coss` registry, Tailwind v4, cva, tailwind-merge, lucide-react, zustand)

- R10. **Small, decoupled files (DEC-004).** One concern per file. Hard limit **250 lines** per hand-written source file (generated files, lockfile, JSON examples excluded), enforced by a `check:size` script that is part of `pnpm check`. Specifically:
  - Contract: one file per component (`components/<name>.ts`), tokens split per group (`tokens/space.ts`, `tokens/colors.ts`, … + `tokens/index.ts`), shared schemas in their own files.
  - Renderer: the kit boundary is a **folder** `src/kit/` (one facade file per kit component, e.g. `kit/button.ts`, + `kit/index.ts`); it is the only place importing the UI kit (lint-enforced). One implementation file per component (`components/<name>.tsx`).
  - Mapping lives **next to the code it describes**: each component file exports a `mapping` object (contract prop → kit prop, value maps). `MAPPING.md` is **generated** from those objects by `pnpm docs` (never hand-edited), so docs cannot drift from code.
  - Remapping one component = editing one component file (+ its kit facade file if the kit API differs).

---

## 1. Goal

A monorepo that lets a developer:
1. Define a component **contract** (A2UI catalog) for a UI kit — currently Chakra UI v1 — called **ui-kit-one**.
2. Render A2UI JSON with a **renderer** that maps the contract to real components, isolated so the kit can be swapped for a Chakra v1 fork by changing one import file.
3. Use a **local playground** to paste/edit A2UI JSON, preview it with only ui-kit-one components, interact with forms (live data model), see outgoing events, simulate server replies (mock rules), and view the generated catalog JSON and agent system prompt.
4. Generate an **agent system prompt** + **response contract** from the catalog (no agent wiring in this scope; seams for it are required).
5. Remap to another kit later with a documented, test-gated procedure that a weak agent can follow.

---

## 2. Fixed decisions

| Key | Value |
|---|---|
| Package manager | `pnpm@10.15.0` (`packageManager` field) |
| Node | 24.x |
| npm scope | `@agentic-ui/*` |
| License / author | `UNLICENSED` / `Shterenberg Zakhar Gennadievich <shternberg.inbox@gmail.com>` |
| A2UI protocol | **v0.9** (messages carry `"version": "v0.9"`) |
| catalogId | `urn:agentic-ui:catalog:ui-kit-one:v1` |
| React | **18.3.x** everywhere (Chakra v1 constraint) |
| UI kit (renderer) | `@chakra-ui/react@1.8.9`, `@chakra-ui/icons@1.1.7`, `@emotion/react@^11`, `@emotion/styled@^11`, `framer-motion@6.5.1` |
| A2UI libs | `@a2ui/web_core@0.14.0`, `@a2ui/react@0.14.0`, `@a2ui/agent@0.0.2` |
| Zod | `3.25.76` (A2UI peer) |
| Tooling | match ru-code-packages: `vite-plus` (`vp`), `@typescript/native-preview` (`tsgo`), `tsdown`, `oxlint`, `oxfmt` — same versions as that repo unless incompatible (then record deviation) |
| Playground UI | React 18 + `@base-ui/react` + Tailwind v4 + shadcn `base-mira` style/`@coss` registry + cva + tailwind-merge + lucide-react + zustand + CodeMirror 6 |
| Tests | Vitest (via `vp test`), @testing-library/react, Playwright (Chromium) |
| Example content | **Russian** text, **RUB** currency, `ru-RU` locale |
| Contract docs language | English (`.describe()` texts, docs) |
| Styling escape hatches | `sx`, `__css`, raw CSS, responsive object/array props: **not exposed** in v1 (see §5.2) |

---

## 3. Repository layout

```
/
├─ package.json                 # @agentic-ui/root (private); root scripts §10
├─ pnpm-workspace.yaml          # packages/*, apps/*
├─ tsconfig.base.json           # strict flags from ru-code-packages, WITHOUT effect plugin
├─ .oxlintrc.json  .oxfmtrc.json  .gitignore
├─ AGENTS.md  README.md  REMAP.md  COVERAGE.md
├─ docs/
│  ├─ SPEC.md  DECISIONS.md
│  ├─ reports/                  # NN-<step>.md, NN-<step>.review.md
│  └─ screenshots/              # human-browsable PNGs + index README.md
├─ packages/
│  ├─ ui-kit-one-catalog/       # @agentic-ui/ui-kit-one-catalog  — CONTRACT (no React, no Chakra)
│  ├─ ui-kit-one-react/         # @agentic-ui/ui-kit-one-react    — RENDERER (Chakra v1)
│  └─ ui-kit-conformance/       # @agentic-ui/ui-kit-conformance  — renderer-agnostic behavior suite
└─ apps/
   └─ playground/               # @agentic-ui/playground          — port 3458
```

---

## 4. How A2UI works here (context for implementers)

- Agent → client messages (v0.9): `createSurface`, `updateComponents` (flat list, adjacency by id, one `id: "root"`), `updateDataModel` (JSON Pointer `path` + `value`), `deleteSurface`.
- Dynamic props: literal | `{ "path": "/json/pointer" }` | `{ "call": "fn", "args": {...} }`. Relative paths inside list templates.
- Children: `ComponentId` (single) or `ChildList` (array of ids | `{ componentId, path }` template).
- Inputs two-way bind to the data model locally. Actions (`action.event: {name, context}`) are the only thing sent back to the agent; `sendDataModel: true` on `createSurface` attaches the full data model.
- Catalog = JSON Schema of allowed components + functions. Renderer = Zod API + implementation per component (`createComponentImplementation` from `@a2ui/react/v0_9`), grouped in `Catalog` (`@a2ui/web_core/v0_9`).
- `generateCatalogSchema(catalog)` (`@a2ui/web_core`) produces `catalog.json` from Zod APIs.
- `@a2ui/agent`: `A2uiGenerator` + `CatalogConfig` → `processor.promptSnippet`, `parseResponse`, `openStream`, `validatePayload`. Response contract: text + `<a2ui-json>[...messages]</a2ui-json>` blocks.
- Spec docs: `/tmp/a2ui-research/a2ui/specification/v0_9_1/docs/a2ui_protocol.md`.

---

## 5. Contract package — `@agentic-ui/ui-kit-one-catalog`

No React, no Chakra dependency. Depends on `zod`, `@a2ui/web_core`; dev: `@a2ui/agent`.

```
src/
  catalog-id.ts           # CATALOG_ID constant
  tokens.ts               # ALL design tokens (single file, see §5.1)
  style-props.ts          # shared StyleProps schema built from tokens
  icons.ts                # IconName enum (names only)
  components/<name>.ts    # one Zod API per component: { name, schema }
  components/index.ts
  functions.ts            # function APIs exposed (reuse A2UI basic functions)
  catalog.ts              # contract-only Catalog (APIs, no implementations)
  index.ts
examples/
  compositions/NN-<slug>.json   # §7
  components/<Name>.json        # §7
scripts/
  build-json.ts           # → dist/catalog.json
  build-prompt.ts         # → dist/system-prompt.md
  validate.ts             # examples vs catalog
  build-docs.ts           # → CONTRACTS.md
```

### 5.1 Tokens (`tokens.ts`)
- Values copied as literal constants from Chakra UI v1 default theme (`@chakra-ui/theme` v1), **not imported** at runtime. Well formatted, grouped, commented with source path, so the owner can replace values later in this one file.
- Groups: `space`, `colors` (palette names + shades actually exposed), `colorSchemes`, `radii`, `fontSizes`, `fontWeights`, `shadows`, `sizes` (widths/maxW), `boxSizes` (icon/avatar).
- Every enum in schemas is derived from this file (no duplicated literals elsewhere).

### 5.2 Styling policy
- No `sx`, no `__css`, no raw CSS strings, no responsive syntax in v1. Rationale recorded in CONTRACTS.md: validation, brand safety, security (fixed overlays / arbitrary `url()`).
- Shared `StyleProps` (all optional, token enums only): `p px py m mx my gap bg color borderRadius borderWidth borderColor shadow w maxW minH textAlign`. Applied to layout components (Box, Center, Container, Flex, Grid) and selectively elsewhere where meaningful.

### 5.3 Component contracts (19)
All props have `.describe()`. Child references use A2UI `ComponentId` / `ChildList`. Dynamic values use `CommonSchemas.Dynamic*`. Interactive inputs support `checks` (A2UI `Checkable`) where noted.

| Name | Props (beyond StyleProps where applicable) |
|---|---|
| Box | `children?: ChildList`, StyleProps |
| Center | `children?: ChildList`, StyleProps |
| Container | `children?: ChildList`, `maxW` (container size token), `centerContent?: boolean`, StyleProps |
| Flex | `children?: ChildList`, `direction: row\|column`, `align`, `justify`, `wrap?: boolean`, `gap`, StyleProps |
| Grid | `children?: ChildList`, `columns: 1..6`, `gap`, StyleProps |
| Text | `text: DynamicString` (req), `size`, `color`, `fontWeight`, `align`, `noOfLines?` |
| Heading | `text: DynamicString` (req), `level: h1\|h2\|h3\|h4`, `size`, `color`, `align` |
| Button | `label: DynamicString` (req), `action` (req), `variant: solid\|outline\|ghost\|link`, `colorScheme`, `size: sm\|md\|lg`, `leftIcon?/rightIcon?: IconName`, `isDisabled?: DynamicBoolean`, `isLoading?: DynamicBoolean`, `fullWidth?: boolean`, `checks?` (button disabled while any check fails) |
| Checkbox | `label` (req), `value: DynamicBoolean` (req), `colorScheme`, `isDisabled?`, `checks?` |
| Input | `label` (req), `value: DynamicString` (req), `placeholder?`, `type: text\|email\|password\|number\|tel`, `helperText?`, `isRequired?`, `isDisabled?`, `checks?` — renders as labeled form control with helper + validation error text |
| RadioGroup | (intent "Radio") `label` (req), `options: [{label, value}]` (req), `value: DynamicString` (req), `direction: row\|column`, `colorScheme`, `isDisabled?`, `checks?` |
| Switch | `label` (req), `value: DynamicBoolean` (req), `colorScheme`, `isDisabled?` |
| List | `children: ChildList` (req; static or template), `variant: unordered\|ordered\|plain`, `spacing` |
| Table | `columns: [{header, key, align?, format?: text\|number\|currency\|date}]` (req), `rows: DynamicValue` bound to array of objects (req), `variant: simple\|striped`, `size`, `caption?`. Currency/date formatting uses `ru-RU`/`RUB` defaults, overridable via `currency?`/`locale?` props |
| Tag | `label` (req), `colorScheme`, `variant: solid\|subtle\|outline`, `size` |
| Modal | `trigger: ComponentId` (req), `content: ComponentId` (req), `title?: DynamicString`, `size`, `open?: DynamicBoolean` (optional two-way binding for programmatic control), `closeOnAction?: boolean` (default true: any event action fired inside content closes the modal) |
| Tabs | `tabs: [{title: DynamicString, child: ComponentId}]` (req), `variant: line\|enclosed\|soft-rounded`, `colorScheme`, `selectedIndex?: DynamicNumber` (two-way) |
| Avatar | `name: DynamicString` (req), `src?: DynamicString`, `size` |
| Icon | `name: IconName` (req; ~40 names mapped to `@chakra-ui/icons` in renderer), `color`, `size` (boxSize token) |

### 5.3a Naming principle — passthrough first (DEC-005)
- Contract prop names and enum values **equal the kit's (Chakra v1) prop names and values** wherever the prop is plain data: `fontSize`, `fontWeight`, `textAlign`, `colorScheme`, `variant`, `size`, `spacing`, `direction`, `align`, `justify`, `maxW`, `p`, `bg`, … (StyleProps included). No renames like `size→fontSize` or `align→textAlign`. The §5.3 table's prop names are adjusted accordingly.
- Kit defaults apply when a prop is omitted; the renderer does not re-declare defaults.
- Renderer provides one generic factory (`passthrough(Api, KitComponent, options)`) that: resolves dynamic values, passes plain props 1:1, renders `children`/`child` component references, maps `text`/`label` → kit `children`. Components that are pure passthrough are **one line** in a registry, not a file.
- Custom implementation files exist **only** where A2UI semantics require translation: Button (action, icons), Checkbox / Switch / Input / RadioGroup (two-way binding, checks, labeled form control), Table (columns + bound rows → Thead/Tbody/Tr/Td, formatting), Modal (trigger/content/open), Tabs (tabs[] → TabList/TabPanels, selectedIndex), Icon (name → icon component), List (template children → ListItem). Expected passthrough: Box, Center, Container, Flex, Grid, Text, Heading, Tag, Avatar.
- `mapping` objects: identity props are derived automatically (no hand listing); only non-identity props are declared. Generated MAPPING.md shows both.
- Exceptions to identical names are allowed only when A2UI requires a different shape (e.g. `text`/`label` because A2UI `children` is reserved for component references; `columns` on Grid instead of raw `templateColumns`) and each exception is documented in CONTRACTS.md.

### 5.4 Functions
Expose A2UI basic functions (reuse implementations from `@a2ui/web_core/v0_9` basic catalog): `required regex length numeric email formatString formatNumber formatCurrency formatDate pluralize openUrl and or not`. Verify `formatCurrency`/`formatDate` with `ru-RU`/`RUB`.

### 5.5 Scripts output
- `dist/catalog.json` — spec-compliant v0.9 catalog (`$id` = `catalogId` = CATALOG_ID), validated against A2UI meta-schema / test suite.
- `dist/system-prompt.md` — from `@a2ui/agent` `promptSnippet`: base rules + catalog + N curated few-shot examples (default 5, configurable via CLI flag) + response contract section. Script prints approx token count.
- `CONTRACTS.md` — generated: per component purpose, props table (type, required, enum values, default, description), bindings (two-way props), actions, minimal JSON example (from `examples/components`). Plus styling policy and functions list.

---

## 6. Renderer package — `@agentic-ui/ui-kit-one-react`

Peer deps: react 18, react-dom 18, Chakra v1 set. Deps: `@a2ui/react`, `@a2ui/web_core`, `@agentic-ui/ui-kit-one-catalog`.

```
src/
  kit/                    # THE ONLY FOLDER importing '@chakra-ui/react' / '@chakra-ui/icons' (lint-enforced); one facade file per kit component + index.ts
  icon-map.ts             # IconName → icon component (imports icons via kit.ts)
  components/<name>.tsx   # one implementation per component, rigid shape (below)
  catalog.ts              # uiKitOneCatalog = new Catalog(CATALOG_ID, 'v0.9', impls, functions)
  provider.tsx            # <UiKitProvider> = ChakraProvider + theme + iframe/document environment support
  runtime/
    transport.ts          # Transport interface + LocalTransport
    runtime.ts            # createUiKitRuntime({ transport }) → processor wiring, surfaces store
    use-surfaces.ts       # React hook: live surfaces list
    surface.tsx           # <UiKitSurface surface=…/> (A2uiSurface)
  index.ts
MAPPING.md                # GENERATED by `pnpm docs` from each component's exported `mapping` object
```

Rigid component file shape:
```tsx
import { ButtonApi } from '@agentic-ui/ui-kit-one-catalog';
import { Button as KitButton } from '../kit';
const VARIANT = { solid: 'solid', outline: 'outline', ghost: 'ghost', link: 'link' } as const; // contract → kit
export const Button = createComponentImplementation(ButtonApi, ({ props }) => (/* … */));
```

Transport seam (required now, real transports later):
```ts
interface Transport {
  onMessages(cb: (messages: A2uiMessage[]) => void): () => void; // agent → UI
  sendAction(action: A2uiActionEvent, dataModel?: unknown): void; // UI → agent
}
```

---

## 7. Examples (in contract package)

File format (same as A2UI spec examples): `{ "name", "description", "messages": [...] }`. All text Russian, money RUB (formatted via `formatCurrency` or Table `format: currency`), dates `ru-RU`. Data that varies (lists, tables, form values) lives in `updateDataModel`, bound by path — not hardcoded. Every composition uses `sendDataModel: true` when it has inputs.

Compositions (`examples/compositions/`), each with its action event names:

| ID | File | Content | Events |
|---|---|---|---|
| EX-01 | 01-login.json | Container, Heading, Input email+password (required, email checks), Checkbox "remember", Button | `login.submit` |
| EX-02 | 02-signup.json | Inputs ×4 with checks, RadioGroup, Switch, Button disabled until valid | `signup.submit` |
| EX-03 | 03-settings.json | Heading, Switch ×4, RadioGroup, Button | `settings.save` |
| EX-04 | 04-user-list.json | List template over `/users`: Avatar, Text, Tag | `user.open` |
| EX-05 | 05-data-table.json | Heading, Table bound rows, Tag | — |
| EX-06 | 06-confirm-delete.json | Button → Modal (trigger/content), Text, Buttons ×2 | `item.delete`, `modal.cancel` |
| EX-07 | 07-tabbed-profile.json | Tabs (Обзор / Безопасность / Активность), Grid, Text | `profile.edit` |
| EX-08 | 08-pricing.json | Grid 3 cols, Box cards, Heading, List, Tag, Button | `plan.select` |
| EX-09 | 09-onboarding.json | Checkbox ×5 bound, progress Text bound to same data | `onboarding.continue` |
| EX-10 | 10-empty-state.json | Center, Icon, Heading, Text, Button | `empty.create` |
| EX-11 | 11-notifications.json | List, Avatar, Text, Tag, Flex | `notification.read` |
| EX-12 | 12-search-filters.json | Input, Checkboxes, RadioGroup, Table | `search.apply` |
| EX-13 | 13-bank-account-overview.json | Avatar header, Grid of balance cards (Heading/Text/Tag) | `account.open` |
| EX-14 | 14-bank-transactions.json | Table `/transactions` (date, merchant, amount currency, status Tag) | `transaction.open` |
| EX-15 | 15-bank-transfer.json | RadioGroup from-account, Inputs recipient/amount with checks, Switch save template, Button → Modal summary bound to form data | `transfer.confirm`, `transfer.cancel` |
| EX-16 | 16-bank-card-management.json | Box card visual, Switches (freeze, online, contactless), Tag status | `card.update` |
| EX-17 | 17-bank-loan-offer.json | Heading, Grid (rate/term/payment), List conditions, Checkbox agree, Button disabled until agreed | `loan.apply` |
| EX-18 | 18-bank-bill-payment.json | Tabs (ЖКХ / Мобильная связь / Интернет), Inputs, Button | `bill.pay` |
| EX-19 | 19-bank-fraud-alert.json | Icon warning, Heading, Text details, Buttons "Это я" / "Заблокировать карту" | `fraud.confirm`, `fraud.block` |
| EX-20 | 20-bank-spending-summary.json | Grid categories, Tag % change, Table top merchants | — |

Component snippets (`examples/components/<Name>.json`): one minimal, valid, renderable example per component (19), demonstrating main props.

Mock rules presets (`examples/mock-rules/*.json`, used by playground): at least `transfer.confirm → success screen`, `login.submit → welcome screen`, `fraud.block → card blocked screen`, `loan.apply → application accepted`. Format: `{ "event": "<name>", "messages": [...] }`.

---

## 8. Conformance package — `@agentic-ui/ui-kit-conformance`

Renderer-agnostic. Exports a function that registers Vitest suites given `{ catalog, Provider }` (any renderer of the ui-kit-one contract). Uses jsdom + @testing-library/react, queries by accessible role/label/text (never by kit-specific class names).

Must cover, for every component: renders from its snippet; required props shown; enum values mapped (no runtime warnings); two-way bindings update the data model; actions emit correct `{name, context}`; checks show/hide errors and disable buttons; Modal open/close (trigger, close button, Esc, closeOnAction, `open` binding); Tabs switching + `selectedIndex` binding; List/Table templates over data; all 20 compositions render with zero errors/warnings.

`ui-kit-one-react` runs it in its own test suite. `pnpm conformance` runs it.

---

## 9. Playground — `@agentic-ui/playground`

React 18, `@base-ui/react`, Tailwind v4, shadcn `base-mira` style via `@coss` registry (mirror `ru-code/apps/web/components.json`), cva, tailwind-merge, lucide-react, zustand, CodeMirror 6. Port **3458**. Production build served statically (`vp preview`).

Layout: left sidebar (Compositions, Components) | center JSON editor | right preview; bottom panel with tabs. Resizable panes.

| ID | Feature |
|---|---|
| PG-01 | Sidebar: list of 20 compositions (name + description); click loads into editor + preview |
| PG-02 | Sidebar: 19 component snippets; click loads |
| PG-03 | JSON editor (CodeMirror 6): JSON syntax highlight, lint with line/col errors, format button, copy, reset to selected example |
| PG-04 | Editor accepts: array of messages, JSONL, single message, or example file object `{name, messages}` (auto-detect) |
| PG-05 | Live preview re-renders on edit (debounced); last valid render stays visible while JSON is invalid, with error indicator |
| PG-06 | Main preview = device frame containing an iframe that loads the playground `/preview` route (separate document, true viewport, media queries work). Inline previews (component catalog cards, detail view) render in-document with the scoped provider (`[data-ui-kit-root]`: `resetCSS=false`, global styles off, `cssVarsRoot` scoped, kit-owned scoped reset incl. `* { position: relative; box-sizing: border-box }`, portals inside root). Proof: Playwright pixel-match scoped vs Chakra-only page; no style leaks either direction (DEC-001, DEC-002) |
| PG-07 | Device presets: iPhone SE 375×667, iPhone 15 393×852, Pixel 7 412×915, iPad 768×1024, iPad landscape 1024×768, Laptop 1280×800, Desktop 1440×900, Fill; rotate; zoom-to-fit; subtle device chrome (DEC-002) |
| PG-08 | Only ui-kit-one catalog is registered; unknown component types show a visible error |
| PG-09 | Errors tab: JSON parse errors, schema validation errors (path + message, via catalog validation), render/runtime errors, console errors from preview |
| PG-10 | Data model tab: live JSON view per surface, updates as user types/toggles; editable with "Apply" (applies `updateDataModel`) |
| PG-11 | Events tab: log of outgoing actions (time, surface, name, context, data model when `sendDataModel`), clear button |
| PG-12 | Mock rules tab: list/add/edit/delete rules `event → messages`; presets loadable; when an event fires and a rule matches, its messages are applied to the preview (simulated agent reply), logged |
| PG-13 | Catalog tab: generated catalog JSON viewer, copy, download |
| PG-14 | Prompt tab: generated system prompt viewer (with examples count control), copy, download, approx token count |
| PG-15 | Editor content, selected example, viewport, mock rules persisted in localStorage; "Reset all" |
| PG-16 | Transport seam: playground uses `LocalTransport`; swapping to a network transport requires no renderer changes (documented + unit test with fake transport) |
| PG-17 | Keyboard: Ctrl/Cmd+S formats, Ctrl/Cmd+Enter forces re-render |
| PG-18 | Production build passes; no console errors on load |
| PG-19 | **Dark theme only**, polished, zero sloppiness: coherent design system (spacing scale, type scale, subtle borders, elevation, focus rings, hover/active states, transitions, empty/loading/error states, Lucide icons), quality bar comparable to Linear/Vercel dashboards. Chakra preview content uses Chakra v1 dark color mode by default (single config switch in kit provider) |
| PG-20 | Component catalog page: grid of 19 cards with live inline preview; detail view per component: live preview, props table (from contract), tabs **JSON** (snippet) / **React** (renderer implementation source) / **Contract** (Zod source) / **JSON Schema** (generated entry), all syntax-highlighted with copy buttons |
| PG-21 | Compositions view: tabs **JSON** (editable) / **JSX** (generated read-only JSX equivalent of the A2UI tree using kit component names) / **Data model** |
| PG-22 | Syntax highlighting: Shiki (dark theme) for read-only code (TSX, TS, JSON, Markdown); CodeMirror 6 with matching dark theme for the editor |
| PG-23 | Open preview in new tab: `/preview` route works standalone; live-synced with the editor (typed BroadcastChannel channel); also restorable from URL hash (compressed JSON) without the opener |
| PG-24 | Preview ↔ app sync: data model changes, events, errors and mock-rule replies flow between `/preview` documents (iframe or tab) and the main app through one typed channel module; covered by unit + e2e tests |
| PG-25 | Routing: `/` (workspace: editor + device preview + bottom panel), `/components` (catalog), `/components/:name` (detail), `/llm-context` (PG-26), `/preview` (standalone) |
| PG-26 | **LLM Context page** (`/llm-context`, sidebar entry): everything the model receives, measured in tokens. (a) Sections of the assembled system prompt: response contract/base rules, catalog components, functions, common types/$defs, catalog rules, few-shot examples, custom instructions — each with token count, % share, stacked bar. (b) Per-component cost table (schema entry tokens), sortable. (c) Live controls: include/exclude components (A2UI `ComponentPruningTransformer`), number of examples, inference format (Direct JSON / Express), custom instructions textarea → recomputed instantly with delta vs default. (d) Per-turn payloads: action event + data model (`sendDataModel`) from the current workspace state, tokens. (e) Output cost: tokens each of the 20 compositions costs the model to generate (table). (f) Context window gauge vs selectable model window (32k / 128k / 200k / 1M). (g) Full assembled prompt viewer (Shiki, section anchors), copy, download. Tokenizers (selectable): **Qwen** exact (vendored Qwen2.5/Qwen3 `tokenizer.json`, runs offline, lazy-loaded), **OpenAI o200k** exact (js-tiktoken), **approx** chars/4; label which are exact vs approximate (no offline Claude tokenizer exists). Unit tests assert counts against known reference strings per tokenizer; e2e covers controls (DEC-003) |

---

## 10. Root scripts

`dev` (playground), `build` (all), `typecheck`, `lint`, `fmt`, `fmt:check`, `test` (unit, all), `conformance`, `e2e` (Playwright), `e2e:update` (refresh baselines + docs/screenshots), `validate` (examples), `catalog:json`, `catalog:prompt`, `docs` (CONTRACTS.md), `check` (= fmt:check + lint + typecheck + test + validate + build + e2e).

---

## 11. Proof & docs

| ID | Deliverable |
|---|---|
| PR-01 | Unit tests: tokens/schemas, catalog.json generation + meta-schema validity, prompt generation, every example valid, renderer components, runtime/transport |
| PR-02 | Conformance suite green against ui-kit-one-react |
| PR-03 | Playwright e2e covering every PG-* feature with real user interaction |
| PR-04 | Playwright visual baselines + `docs/screenshots/{components,compositions,playground}/*.png` for: every component snippet and every composition at desktop (1280) and mobile (375); playground states (each bottom tab, error state, modal open, mock-rule flow before/after); `docs/screenshots/README.md` index table |
| PR-04b | Playground screenshots: every route, every bottom tab, every device preset (at least one composition each), component detail tabs, new-tab preview — all dark theme |
| PR-05 | `COVERAGE.md`: matrix of every `INT-*`/`EX-*`/`PG-*`/`PR-*`/`DOC-*` → status (shipped / alternative) → evidence (test file::name, screenshot path) |
| DOC-01 | `README.md`: run commands, 1-page "how A2UI works", architecture diagram, package roles |
| DOC-02 | `AGENTS.md`: layout, rules (generated files, kit.ts boundary), command per task |
| DOC-03 | `REMAP.md`: step-by-step for a weak agent to swap Chakra v1 → fork (same contract) and to create `ui-kit-two` (new contract); done = `pnpm check` green |
| DOC-04 | `packages/ui-kit-one-react/MAPPING.md`: per component contract prop → kit prop/value map |
| DOC-05 | `CONTRACTS.md` generated (§5.5) |
| DOC-06 | How to add a component / add an example / wire an agent later (transport + prompt + parseResponse) — section in README or AGENTS |
| DOC-07 | Remap dry-run evidence: a fresh agent following REMAP.md performs a trivial kit change and gets `pnpm check` green (performed by orchestrator in review phase) |

Top-level intents (all map to the above):
- INT-01 contract package with 19 components + tokens + functions
- INT-02 catalog JSON export
- INT-03 system prompt + response contract generation
- INT-04 renderer with single kit import boundary
- INT-05 transport seam for future agent wiring
- INT-06 examples: 20 compositions (RU/RUB, 8 banking) + 19 snippets + mock rule presets
- INT-07 playground (PG-01..18)
- INT-08 conformance suite
- INT-09 full proof (PR-01..05)
- INT-10 docs enabling remap by a weak agent (DOC-01..07)

---

## 12. Report formats (zero prose)

Implementer: `docs/reports/NN-<step>.md`
```
step: NN-<step>
commit: <sha>
files: +<added> ~<modified> -<deleted>
checks:
  typecheck: pass|fail
  lint: pass|fail (<n> warn)
  test: pass|fail <passed>/<total>
  build: pass|fail
  e2e: pass|fail|n/a <passed>/<total>
intents_done:
  - <ID>: <one line> | evidence: <file::test or path>
deviations_from_spec:
  - id: D<n> | spec: <§/ID> | what | why_better
open_issues:
  - id: I<n> | severity: blocker|major|minor | what
```

Reviewer: `docs/reports/NN-<step>.review.md`
```
step: NN-<step>
reviewed_commit: <sha>
checks_rerun: typecheck <r> | lint <r> | test <r> | build <r> | e2e <r>
intent_verification:
  - <ID>: verified|unverified|broken | <evidence checked>
findings:
  - id: R<n> | severity: blocker|major|minor | file:line | what | repro | fix
verdict: pass|fail
```

Orchestrator: `docs/DECISIONS.md` (append-only): `<id> | fix|alternative|invalid | <reason>`

---

## 13. Implementation steps (implementer, sequential)

| # | Step | Exit criteria |
|---|---|---|
| 01 | setup + spike: root tooling, workspace, install; prove: Zod→catalog.json, React 18 + Chakra v1 + @a2ui/react render, iframe-portal preview with Chakra Modal inside Tailwind page, `validatePayload`/validation in browser, prompt generation, Playwright screenshot | `docs/reports/01-setup-spike.md` lists each risk → result → chosen approach |
| 02 | contract package (§5) | scripts produce outputs; unit tests green |
| 03 | renderer (§6) | all 19 render; runtime + transport tested |
| 04 | examples (§7) | `pnpm validate` green; all render via renderer tests |
| 05 | playground (§9) | dev + build; all PG features usable |
| 06 | conformance (§8) + unit gaps | green |
| 07 | e2e + screenshots (PR-03, PR-04) | green; screenshots committed |
| 08 | docs (DOC-01..06) + COVERAGE.md | every ID in matrix with evidence |
| 09 | `pnpm check` green from clean clone (`git clean -xfd` in a temp clone, install, check) | report |
