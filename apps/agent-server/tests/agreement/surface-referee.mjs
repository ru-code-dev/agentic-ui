/**
 * SV-C28 multi-turn referee: a chat's replies merged in order by the page store itself (`createChatSurfaces` of the
 * catalog, which @agentic-ui/a2ui-react runs: @a2ui/agent RendererState over web_core's MessageProcessor + the
 * project rules of src/project-rules.ts; a rejected reply leaves the chat's state as it was, A5-01), so the
 * agreement proves the server == the page.
 * A step `"rollback"` (DEC-064: the page rejected the previous reply, its repair names it in `repairOf`) drops the
 * previous step when it was accepted (`undo`), as the page's surfaces and the server do.
 * Usage: node apps/agent-server/tests/agreement/surface-referee.mjs <sequences.json>   ([{ id, steps: [messages] }])
 * Prints [{ id, steps: [{ valid, error, state }] }]; state (after the step) = { surfaceId: { components: { id:
 * { id, component, ...properties } }, data } } as JSON.stringify writes it, for the merged-state agreement.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const pkg = resolve(root, "packages/ui-kit-one-catalog");
const { createChatSurfaces } = await import(pathToFileURL(resolve(pkg, "src/index.ts")).href);

const snapshot = (surfaces) =>
  Object.fromEntries(
    Object.entries(surfaces.snapshot()).map(([sid, { components, data }]) => [
      sid,
      {
        components: Object.fromEntries(
          Object.entries(components).map(([id, comp]) => [id, { id, ...comp }]),
        ),
        data,
      },
    ]),
  );
const sequences = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = sequences.map(({ id, steps }) => {
  const surfaces = createChatSurfaces();
  let last = false; // whether the previous step was accepted
  return {
    id,
    steps: steps.map((messages) => {
      if (messages === "rollback") {
        if (last) surfaces.undo();
        last = false;
        return { valid: true, error: null, state: snapshot(surfaces) };
      }
      const verdict = surfaces.merge(messages);
      last = verdict.valid;
      return {
        valid: verdict.valid,
        error: verdict.valid ? null : verdict.message,
        state: snapshot(surfaces),
      };
    }),
  };
});
process.stdout.write(JSON.stringify(out));
