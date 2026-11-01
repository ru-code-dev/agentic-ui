# @agentic-ui/a2ui-react

Web integration package (SV-C26, SV-C27): one private package that bundles the ui-kit-one catalog, the
ui-kit-one renderer and the agent client with their types. Install the packed tarball (`pnpm pack` here) with
its peers: `react`, `react-dom` ^18.3, `@chakra-ui/react` ^1.8.0, `@chakra-ui/icons` ^1.1.0, `@emotion/react`,
`@emotion/styled` ^11, `framer-motion` ^6.5.0 (caret ranges, D3-01: npm installs it next to any Chakra 1.8.x; the
repo builds and tests with 1.8.9 / 1.1.7 / 6.5.1, `tests/tarball.test.ts` also installs it with npm next to 1.8.8 /
1.1.5). Regular dependencies: `@a2ui/*`, `zod`.

```js
import { A2UIChat, useA2UIChat } from "@agentic-ui/a2ui-react"; // client module ("use client")

const chat = useA2UIChat({ endpoint: "/api" }); // status, working, error, turns, surfaces, send, cancel, retry, models, setModel
<A2UIChat chat={chat} placement="anchored" interactive="all" />; // or "follow" | "panel", "latest"
```

- Next.js / SSR (A5-04): the client entry `@agentic-ui/a2ui-react` is browser-only. Its bundled renderer subclasses
  `HTMLElement` when the module loads, so a server import throws `ReferenceError: HTMLElement is not defined`, and
  `"use client"` alone does not help (Next.js still renders client components on the server). Load the chat with
  `next/dynamic(() => import("./assistant"), { ssr: false })`. `@agentic-ui/a2ui-react/core` is SSR-safe.
  `tests/tarball.test.ts` pins both.
- Security (A5-08): the rendered UI is model output. An `Avatar` `src` loads whatever URL a reply puts there (a
  literal, a binding or a `formatString` over pasted data) on render, with no click. The host page MUST send a
  `Content-Security-Policy` with `img-src 'self' data: <its image hosts>`: the host owns CSP as it owns auth
  (`docs/server/DEPLOY.md` §6 has the nginx line).
- `@agentic-ui/a2ui-react/core` (no React, no DOM): `createAgentClient({endpoint, fetch?, headers?})`,
  `createA2UIChat`, `extractA2UI(text)`, `validateMessages(messages)`, `createChatSurfaces` / `createSurfaceLog`
  (SV-C28 merge-then-check, with the reference server's project rules: bound value types incl. tab titles and
  table rows, template lists, blank surface ids; A5-01), `CONTRACT_VERSION` (DEC-056).
- `useA2UIChat` options: `endpoint` / `fetch` / `headers`, or `client` (a host's own transport, a scripted agent);
  `chatId` (the server conversation id; default a new random one), `pollMs` (the `/progress` poll interval);
  `chat` (a headless chat the host made with `createA2UIChat`: it outlives the component, e.g. across routes);
  observers `onAction(action, sent)` (every surface action; `sent` is false when the busy chat dropped it) and
  `onError(message)` (render errors; the chat also asks the agent for one repair, DEC-063); `catalog` (REMAP kit swap).
- A turn's `result`: `state` (`text` text only, `ui`, `failed-ui` text + failed UI, `rejected`, `error`,
  `cancelled`), `text` (always shown), `created` / `updated` surface ids, `messages` (the A2UI messages it applied),
  `problem` (DEC-054 details). `chat.chat.reset()` starts a new chat and re-applies the chosen model.
- Retry: every `/prompt` and `/action` carries a `requestId`; `retry()` resends the failed request with the same
  id, so a server still running it (a dropped connection) joins it instead of running the agent twice (A4-08,
  A5-09); a repair turn is a new request.
- Cancel: `/cancel` when the server has it; a `/cancel` that fails or is not applied sets
  `working.cancelUnconfirmed` and the next Cancel stops waiting (A3-16); no `/cancel` aborts the request at once.
- `useA2UISurfaces({onAction, onError})` → `{surfaces, apply}` for a host's own chat; `<A2UISurface surface onAction
onDataModelChange onError fallback>`; `A2UIKitProvider` (the scoped kit provider) or the host's own one
  (`provider` prop). Render errors are scoped per surface: two chats on one page never see each other's errors.
- Server: only `POST /prompt` and `POST /action` are required; `/cancel`, `/progress`, `/models`, `/model` are
  probed once and never fail a chat when missing (`handover/SERVER-CONTRACT.md`).
- Running examples of every integration style: the playground's Integration section (`/integration/<page>`,
  sources in `apps/playground/src/integration/demos/`).

## What a consumer sees (PKG-A-O3)

Documented, not silenced: they are harmless and silencing them would mean re-bundling `@a2ui/agent` or patching
the host's peer packages. `tests/tarball.test.ts` pins exactly this list (a new notice fails the test).

- `vite build`: "Module fs/path has been externalized for browser compatibility" for `@a2ui/agent`'s file
  helpers (never called in the browser) and the chunk-size hint (Chakra is large); a Rollup-based Vite (e.g. 6.4)
  adds `"join" is not exported by "__vite-browser-external"` and the like for every helper member. To hide them,
  alias `fs` and `path` to a stub that exports those members, as the playground does (`apps/playground/vite.config.ts`
  → `apps/playground/src/validation/node-builtins.browser.ts`); an empty module leaves `"…" is not exported by`
  warnings. The test pins the list for the repo's Vite (vite-plus 0.2.2).
- Dev server only (React development build): stock Chakra 1.x's "ReactDOM.render is no longer supported in
  React 18" (its toast manager) and Lit's "Lit is in dev mode". The repo's Chakra patches (`patches/`, pnpm
  `patchedDependencies`) remove the React 18.3 deprecations if a host wants them gone.
- Production build: a clean browser console (a server without `/models` adds only its 404 probe).

Proof: `tests/` (`tests/tarball.test.ts`: the packed tarball in a sample project outside the workspace).
