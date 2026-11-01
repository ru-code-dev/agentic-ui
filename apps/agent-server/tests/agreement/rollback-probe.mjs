/**
 * Probe of an @a2ui/agent 0.0.2 RendererState defect (why surface-referee.mjs replays accepted steps instead of
 * trusting transaction rollback): a reply that retypes a shown component and is then rejected is rolled back
 * without that component. Prints { before, after } (component ids of surface "s").
 */
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const pkg = resolve(root, "packages/ui-kit-one-catalog");
const { RendererState } = await import(
  pathToFileURL(resolve(pkg, "node_modules/@a2ui/agent/src/index.js")).href
);
const { uiKitOneContract } = await import(pathToFileURL(resolve(pkg, "src/index.ts")).href);
const v = "v0.9";
const comps = (...components) => ({ version: v, updateComponents: { surfaceId: "s", components } });
const state = new RendererState([uiKitOneContract]);
const ids = () => [...state.getSurface("s").componentsModel.values].map((c) => `${c.id}:${c.type}`);
state.transaction((s) =>
  s.checkTopology(
    s.apply([
      { version: v, createSurface: { surfaceId: "s", catalogId: uiKitOneContract.id } },
      comps(
        { id: "root", component: "Flex", children: ["cta"] },
        { id: "cta", component: "Text", text: "a" },
      ),
    ]),
  ),
);
const before = ids();
try {
  state.transaction((s) =>
    s.checkTopology(
      s.apply([
        comps({ id: "cta", component: "Heading", text: "b" }),
        comps({ id: "root", component: "Flex", children: ["root"] }),
      ]),
    ),
  );
} catch {
  // the self-reference rejects the reply
}
process.stdout.write(JSON.stringify({ before, after: ids() }));
