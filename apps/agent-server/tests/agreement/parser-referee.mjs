/**
 * P3 parser referee: what @a2ui/agent 0.0.2 `DirectJsonParser` makes of each reply in a corpus.
 * Usage: node apps/agent-server/tests/agreement/parser-referee.mjs <cases.json> [--no-reset]   ([{ id, text }])
 * Prints [{ id, parts: [{ kind: "text", text } | { kind: "a2ui", raw, final }], blocks: [{ messages } | { error }] }].
 * `unwrap` is the lexer (`BlockLexer.tokenize`), `compile` reads one block; the Python port
 * (agentic_ui_server.a2ui) must produce the same parts, messages and error texts.
 *
 * lexer.js keeps a module-global `OPEN_FENCE_RE` (/gm) whose `lastIndex` survives a call that rejected a
 * nested fence, and the next `matchAll` starts there. Before each case a sentinel reply resets it to 0
 * (its fence lies past any leaked index and its body has no fence, so `test()` fails and rewinds), so
 * every case is lexed as by a fresh module, which is what the stateless Python port does. `--no-reset` skips
 * the sentinel (the agreement test proves the leak with it).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const pkg = resolve(root, "packages/ui-kit-one-catalog");
const { DirectJsonParser } = await import(
  pathToFileURL(resolve(pkg, "node_modules/@a2ui/agent/src/index.js")).href
);
const { uiKitOneContract } = await import(pathToFileURL(resolve(pkg, "src/index.ts")).href);

const cases = JSON.parse(readFileSync(process.argv[2], "utf8"));
const parser = new DirectJsonParser([uiKitOneContract]);
const longest = Math.max(0, ...cases.map((c) => c.text.length));
const sentinel = `${"\n".repeat(longest + 1)}\`\`\`\n{}\n</a2ui-json>`;

const reset = !process.argv.includes("--no-reset");
const results = cases.map(({ id, text }) => {
  if (reset) parser.unwrap(sentinel);
  const parts = parser
    .unwrap(text)
    .map((p) =>
      p.type === "text"
        ? { kind: "text", text: p.text }
        : { kind: "a2ui", raw: p.a2uiRaw, final: p.isFinal },
    );
  const blocks = parts
    .filter((p) => p.kind === "a2ui")
    .map((p) => {
      try {
        return { messages: parser.compile(p.raw, p.final) };
      } catch (error) {
        return { error: error.message };
      }
    });
  return { id, parts, blocks };
});
process.stdout.write(JSON.stringify(results));
