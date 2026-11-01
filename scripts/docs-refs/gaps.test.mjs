// DOC-29: what the docs-reference check (scripts/docs-refs/check.mjs) covered too little: a guide inside a package
// (base-relative paths, qwen flags), build outputs seen from the wrong directory, and cross-doc agreement (INTENT §4
// phase status vs docs/TRACEABILITY.ids.json, SV-C ranges vs the last SV-C id). Run: node --test scripts/docs-refs/*.test.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PROJECT_BASE, projectDocsPresent } from "../project-docs.mjs";
import { checkDoc, repoFacts } from "./check.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const facts = repoFacts(root);
const read = (path) => readFileSync(join(root, path), "utf8");
// Amendment A3: a workflow record (INTENT, PLAN, HANDOFF, TRACEABILITY*) is read from WORKFLOW/project/.
const readProject = (path) => readFileSync(join(root, PROJECT_BASE, path), "utf8");
const projectHas = (path) => existsSync(join(root, PROJECT_BASE, path));
const SERVER = "apps/agent-server";
/** Names the server README uses on purpose: a user's own config file, a file of the external ru-code checkout. */
const SERVER_ALLOW = ["my.toml", "fake-acp-server.ts"];

test("[DEC-045] apps/agent-server/README.md names only things that exist (paths relative to its folder) (DOC-29)", () => {
  const options = { base: SERVER, serverFlags: true, qwenFlags: true, allow: SERVER_ALLOW };
  assert.deepEqual(checkDoc(facts, read(`${SERVER}/README.md`), options), []);
});

test("[DEC-045] base, cd and build outputs: a dist/ path needs the package directory (DOC-29)", () => {
  const atRoot =
    "```sh\npnpm run server:build # repo root\npython3 dist/agentic-ui-server.pyz --version\n```";
  assert.deepEqual(checkDoc(facts, atRoot), [
    "dist/agentic-ui-server.pyz: no build output in the repo root (cd into its package)",
  ]);
  const inPackage =
    "```sh\ncd apps/agent-server && python3 dist/agentic-ui-server.pyz --version\n```";
  assert.deepEqual(checkDoc(facts, inPackage), []);
  assert.deepEqual(
    checkDoc(facts, "`scripts/check-generated.mjs` `config.py`", { base: SERVER }),
    [],
  );
  assert.deepEqual(checkDoc(facts, "`scripts/check-generated.mjs`"), [
    "scripts/check-generated.mjs: no such file",
  ]);
  assert.deepEqual(checkDoc(facts, "`nope.py`", { base: SERVER }), [
    `nope.py: no such file in ${SERVER}`,
  ]);
});

test("[DEC-045] qwen CLI flags pass only where allowed; --set KEY=VALUE is a placeholder (DOC-29)", () => {
  const span = "`--auth-type openai --model model-a --core-tools none --set KEY=VALUE`";
  assert.deepEqual(checkDoc(facts, span, { serverFlags: true, qwenFlags: true }), []);
  assert.deepEqual(checkDoc(facts, span, { serverFlags: true }).toSorted(), [
    "--auth-type: no such server flag",
    "--core-tools: no such server flag",
    "--model: no such server flag",
  ]);
  assert.deepEqual(checkDoc(facts, "`--qwen-nope x`", { serverFlags: true, qwenFlags: true }), [
    "--qwen-nope: no such server flag",
  ]);
});

/** Phase names of an INTENT §4 phase cell: `P3–P10 + A2` → P3..P10, A2. */
function phasesOf(cell) {
  const names = [];
  for (const match of cell.matchAll(/\b(P|A)(\d+)(?:[–-]P?(\d+))?\b|\bCF\b/g)) {
    if (match[0] === "CF") names.push("CF");
    else
      for (let n = Number(match[2]); n <= Number(match[3] ?? match[2]); n += 1)
        names.push(`${match[1]}${n}`);
  }
  return names;
}

test("[DEC-032] INTENT §4 phase status agrees with docs/TRACEABILITY.ids.json phases (DOC-29, DOC-07)", (t) => {
  if (!projectDocsPresent(root) || !projectHas("docs/TRACEABILITY.ids.json"))
    return t.skip(`${PROJECT_BASE}/docs workflow records absent (fresh clone)`);
  const { phases } = JSON.parse(readProject("docs/TRACEABILITY.ids.json"));
  const section = readProject("docs/server/INTENT.md").split("\n## 4. Phases")[1].split("\n## ")[0];
  const marked = new Set();
  for (const line of section.split("\n").filter((l) => /^\| (P|CF)/.test(l))) {
    const [phase, deliverable, status] = line.split("|").slice(1, 4);
    if (!status.includes("✅")) continue;
    for (const name of phasesOf(phase).filter((n) => n in phases)) {
      marked.add(name);
      const dropped = new RegExp(`${name} (MCP )?\\(?out of scope`).test(
        `${deliverable} ${status}`,
      );
      assert.equal(phases[name], dropped ? "out" : "done", `INTENT §4 marks ${name} ✅`);
    }
    for (const match of `${deliverable}`.matchAll(/\b(P\d+) out of scope\b/g))
      assert.equal(phases[match[1]], "out", `INTENT §4 says ${match[1]} is out of scope`);
  }
  const closed = Object.entries(phases).filter(
    ([name, state]) => /^(P\d+|CF|A\d+)$/.test(name) && state !== "open",
  );
  for (const [name] of closed)
    assert.ok(marked.has(name), `${name} is ${phases[name]} but not ✅ in INTENT §4`);
});

test("[DEC-045] every SV-C1..Cn range in the guides ends at the last SV-C of INTENT (DOC-29, DOC-05)", (t) => {
  if (!projectDocsPresent(root) || !projectHas("docs/server/INTENT.md"))
    return t.skip(`${PROJECT_BASE}/docs/server/INTENT.md absent (fresh clone)`);
  const ids = [...readProject("docs/server/INTENT.md").matchAll(/^\| SV-C(\d+) \|/gm)].map((m) =>
    Number(m[1]),
  );
  const last = Math.max(...ids);
  const guides = [
    "README.md",
    "AGENTS.md",
    "REMAP.md",
    "docs/server/DEPLOY.md",
    `${SERVER}/README.md`,
  ];
  for (const guide of guides)
    for (const match of read(guide).matchAll(/SV-C1\.\.C?(\d+)/g))
      assert.equal(Number(match[1]), last, `${guide}: ${match[0]}`);
});

test("[A5-08, A5-04] the host-facing docs require a CSP img-src and name the browser-only client entry", () => {
  for (const path of ["packages/a2ui-react/README.md", "docs/server/DEPLOY.md"])
    assert.match(read(path), /Content-Security-Policy[\s\S]{0,80}img-src 'self'/, path);
  const pkg = read("packages/a2ui-react/README.md");
  assert.match(pkg, /next\/dynamic\(.*\{ ssr: false \}\)/);
  assert.match(pkg, /`@agentic-ui\/a2ui-react\/core` is SSR-safe/);
});
