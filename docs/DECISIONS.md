# DECISIONS (append-only)

Format: `<id> | fix|alternative|invalid | <reason>`

DEC-001 | alternative | PG-06: no iframe. Chakra v1 scoped via resetCSS=false + empty global styles + cssVarsRoot + kit-owned scoped reset + portal container inside the preview root. Tailwind v4 preflight is in @layer base, so unlayered Emotion wins. Simpler (one document, no iframe portal / emotion-cache hacks), matches the owner's kit model. Proof: pixel-match vs a Chakra-only page.
DEC-002 | alternative | Owner wants device presets + open-in-new-tab. Main preview = iframe of the /preview route inside a device frame (true viewport) + same route in a new tab, synced over a typed BroadcastChannel; scoped in-document provider kept for catalog cards and production embedding (DEC-001 still proven by pixel-match). Adds PG-19..25: dark-only polished UI, component catalog with JSON/React/Contract/Schema tabs, JSX view, Shiki highlighting, routing.
S01-D1 | alternative | accept: Catalog#toJson() public API instead of internal generateCatalogSchema.
S01-D2 | alternative | accept: spec() mixins + REF: markers → $ref into common_types; smaller prompt.
S01-D3 | alternative | accept: Zod/JSON-Schema agreement test on checks; keep for every Checkable component.
S01-D4 | alternative | accept: kit.ts typed facades (TS2590 on Chakra v1 under TS>=5). REMAP.md must explain facades as the exact surface a fork must satisfy.
S01-D5 | alternative | accept: pnpm patches on Chakra v1 packages. REMAP.md must state patches are version-pinned and how to drop/re-create them for a fork.
S01-D6 | alternative | accept: scoped mode bypasses Chakra ColorModeProvider/CSSVars global writes; proven by e2e.
S01-D7 | alternative | accept: explicit -c for vp lint; tsdown dts via tsgo.
S01-D8 | alternative | accept: commit pnpm-lock.yaml.
S01-D9 | alternative | accept: development/types → src, default → dist exports.
S01-D10 | alternative | accept: 127.0.0.1 for Playwright.
S01-I1 | fix | resolved by steps 02/06 adding scripts.
S01-I2 | invalid | keep Button.action required (matches A2UI basic catalog, keeps LLM output consistent). Trigger buttons use action `modal.open`-style events; document in CONTRACTS.md and Modal snippet.
S01-I3 | fix | step 05: map validatePayload errors (component id + prop) to JSON path + editor line/col for PG-09.
S01-I4 | invalid | dev-only Lit dev-mode log from @a2ui/web_core development condition; production has zero console output (e2e asserts).
S01-I5 | fix | rule: every playground ui primitive that renders a DOM element forwards refs (React 18); extend react18-compat test to all generated ui components.
S01-I6 | fix | step 02 completes all token groups.
DEC-003 | alternative | Owner wants a sidebar page showing all data the LLM receives with token measurement → PG-26 LLM Context page. Default tokenizer Qwen (exact, offline, vendored tokenizer.json) since the project targets Qwen; o200k exact + chars/4 approx as alternatives.
DEC-004 | alternative | Owner requires decoupled small files. R10: 250-line limit enforced by check:size; tokens/ split per group; kit/ folder with one facade per component; per-component mapping objects with generated MAPPING.md.
DEC-005 | alternative | Owner: "describe schema once, names render everything". Contract prop names/values = Chakra names (passthrough), generic passthrough factory for pure-data components (one registry line each), custom files only where A2UI semantics need translation (bindings, actions, Modal, Tabs, Table, Icon, List). Mapping objects list only non-identity props.
