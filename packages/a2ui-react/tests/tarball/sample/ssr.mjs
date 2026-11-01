// `node ssr.mjs` (A5-04): what a server-side render (Next.js App Router, any Node SSR) gets from the installed
// package. `/core` is SSR-safe; the client entry is browser-only (its bundled renderer subclasses HTMLElement at
// module load), so a host loads the chat with `next/dynamic(..., { ssr: false })`. Prints the result as JSON.
const core = await import("@agentic-ui/a2ui-react/core");
const chat = core.createA2UIChat({ endpoint: "/api" });
let client;
try {
  await import("@agentic-ui/a2ui-react");
  client = "imported";
} catch (error) {
  client = `${error?.name}: ${error?.message}`;
}
console.log(JSON.stringify({ core: chat.getState().status, client }));
