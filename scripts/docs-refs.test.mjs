// P10 docs: README.md, AGENTS.md, REMAP.md, docs/server/DEPLOY.md name only things that exist, and cover what the
// spec asks of them. Run: node --test scripts/docs-refs.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDoc, repoFacts } from "./docs-refs/check.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const facts = repoFacts(root);
const read = (path) => readFileSync(join(root, path), "utf8");
const README = read("README.md");
const AGENTS = read("AGENTS.md");
const REMAP = read("REMAP.md");
const DEPLOY = read("docs/server/DEPLOY.md");
/** Recipe 3's example reshape names props that do not exist yet, on purpose. */
const REMAP_EXAMPLE = ["firstName", "lastName"];
const section = (doc, heading) => {
  const start = doc.indexOf(`\n## ${heading}`);
  assert.ok(start >= 0, `missing section: ${heading}`);
  const end = doc.indexOf("\n## ", start + 4);
  return doc.slice(start, end < 0 ? undefined : end);
};

test("[INT-10, DOC-01, DOC-02, DEC-045, P10-deploy-docs] every path, command, flag, key and symbol the guides name exists", () => {
  assert.deepEqual(checkDoc(facts, README), [], "README.md");
  assert.deepEqual(checkDoc(facts, AGENTS), [], "AGENTS.md");
  assert.deepEqual(checkDoc(facts, REMAP, { allow: REMAP_EXAMPLE }), [], "REMAP.md");
  assert.deepEqual(checkDoc(facts, DEPLOY, { serverFlags: true }), [], "docs/server/DEPLOY.md");
});

test("[DEC-045] the checker fails a missing path, script, flag, setting, module or symbol", () => {
  // Built at runtime: a literal would be found in this very source file.
  const symbol = ["pick", "Tokens", "Zz"].join("");
  const doc = [
    `\`packages/ui-kit-one-react/src/kit/nope.ts\` \`pnpm run nope\` \`${symbol}\` \`agent.nope\``,
    "```sh",
    "python3 agentic-ui-server.pyz --nope --set agent.bim=x",
    'cd apps/agent-server && "$WORKFLOW_PYTHON" -m tests.nope',
    "pnpm --filter @agentic-ui/playground nope",
    "```",
    "```toml",
    "[agent]",
    "binary = 'x'",
    "```",
  ].join("\n");
  assert.deepEqual(checkDoc(facts, doc).toSorted(), [
    "--nope: no such server flag",
    "--set agent.bim=x: no such setting",
    "-m tests.nope: no such module (in apps/agent-server)",
    "[toml] agent.binary: no such setting",
    "agent.nope: no such setting or name",
    "packages/ui-kit-one-react/src/kit/nope.ts: no such file",
    `${symbol}: no such symbol in the sources`,
    "pnpm --filter @agentic-ui/playground nope: no such script",
    "pnpm nope: no such root script",
  ]);
  assert.deepEqual(
    checkDoc(
      facts,
      "`src/kit/<name>.ts` `examples/components/<Name>.json` `apps/playground/dist/`",
    ),
    [],
  );
});

test("[DOC-01] README: packages, architecture, how A2UI works, run commands", () => {
  for (const heading of ["Packages", "Architecture", "How A2UI works here", "Commands"])
    section(README, heading);
  for (const dir of [
    "packages/ui-kit-one-catalog",
    "packages/ui-kit-one-react",
    "apps/playground",
    "apps/agent-server",
  ])
    assert.ok(section(README, "Packages").includes(`\`${dir}\``), dir);
  for (const script of ["dev", "build", "test", "e2e", "check"])
    assert.ok(README.includes(`pnpm ${script}`), script);
});

test("[DOC-01] README Architecture is a diagram: every part, linked by arrows, in a text block", () => {
  const diagram = /```text\n([\s\S]*?)\n```/.exec(section(README, "Architecture"))?.[1];
  assert.ok(diagram, "the Architecture section holds a ```text diagram");
  for (const part of [
    "packages/ui-kit-one-catalog",
    "packages/ui-kit-one-react",
    "apps/playground",
    "apps/agent-server",
    "catalog.json",
    "handover/",
    "ACP",
    "Qwen CLI",
    "LLM",
  ])
    assert.ok(diagram.includes(part), `the diagram shows ${part}`);
  assert.ok((diagram.match(/[▶◀▲▼]/g) ?? []).length >= 6, "parts are linked by arrows");
  assert.ok(diagram.split("\n").length >= 6, "a drawing, not a sentence");
});

test("[DOC-09] README Deploy: static build, root and subfolder builds, nginx try_files for both", () => {
  const deploy = section(README, "Deploy");
  for (const text of [
    "apps/playground/dist/",
    "pnpm build:subpath",
    "PLAYGROUND_BASE",
    "try_files $uri $uri/ /index.html",
    "/agentic-ui/index.html",
    "docs/server/DEPLOY.md",
  ])
    assert.ok(deploy.includes(text), text);
});

test("[DOC-10, SV-C23] README Server/agent integration lists every hand-over file and the HTTP contract", () => {
  const integration = section(README, "Server / agent integration");
  const manifest = JSON.parse(read("handover/manifest.json"));
  const entries = new Set(
    Object.keys(manifest.files).map((p) =>
      p
        .replace(/^examples\/.*/, "examples/*.json")
        .replace(/^validator-cases\/.*/, "validator-cases/"),
    ),
  );
  entries.delete("README.md");
  for (const entry of [...entries, "manifest.json"])
    assert.ok(integration.includes(`handover/${entry}`), entry);
  for (const text of ["AGENT_API_BASE", "validatePayload", "/action", "no\nstreaming"])
    assert.ok(integration.replaceAll("\n", " ").includes(text.replace("\n", " ")), text);
});

test("[DOC-11] README Known quirks: pnpm run docs, the vite-plus cache self-heal, dual-platform install", () => {
  const quirks = section(README, "Known quirks");
  for (const text of [
    "`pnpm run docs`",
    "scripts/vp-cache-heal.mjs",
    "unable to open database file",
    "supportedArchitectures",
    "127.0.0.1",
  ])
    assert.ok(quirks.includes(text), text);
});

test("[DOC-02, DOC-06] AGENTS.md: layout, generated files, rules incl. the report/proof process, commands per task", () => {
  for (const heading of [
    "Layout",
    "Rules",
    "Commands per task",
    "How to add a component, an example, or wire an agent",
  ])
    section(AGENTS, heading);
  const rules = section(AGENTS, "Rules");
  for (const text of [
    "src/kit/",
    "DEC-047",
    "DEC-050",
    "DEC-026..030",
    "REPORT-FORMAT.md",
    "pnpm-check.log",
    "DEC-065",
    "DEC-068",
    "WORKFLOW/llm.env",
    "WORKFLOW/secrets",
    "250 lines",
  ])
    assert.ok(rules.includes(text), text);
  for (const generated of [
    "CONTRACTS.md",
    "MAPPING.md",
    "handover/",
    "SERVER-CONTRACT.md",
    "validator-cases/",
    "fallback.json",
  ])
    assert.ok(section(AGENTS, "Layout").includes(generated), generated);
  assert.ok(AGENTS.includes("[`REMAP.md`](REMAP.md)"));
});

test("[DOC-03, DOC-08, DEC-045] REMAP.md: kickoff prompt + recipes with files, what regenerates and the proof command", () => {
  assert.match(
    section(REMAP, "Kickoff prompt (copy-paste)"),
    /```text\n[\s\S]+pnpm check[\s\S]+```/,
  );
  const recipes = [
    "swap the kit import",
    "remap one component onto the owner's custom kit component",
    "rename or reshape a prop",
    "expose only a subset",
    "rename or merge values",
    "fixed kit props",
    "add a component",
    "change or expose tokens",
    "plug the owner's provider",
  ];
  recipes.forEach((name, i) => {
    const body = section(REMAP, `Recipe ${i + 1} — ${name}`);
    assert.match(body, /Proof:/, name);
    assert.ok(body.includes("pnpm check"), name);
  });
  for (const text of [
    "pickTokens",
    "values:",
    "fixed:",
    "patchedDependencies",
    "exact surface a fork must provide",
    "Avatar `name` → `firstName` + `lastName`",
    "Stale preview tab",
    "localStorage",
    "stale workspace build",
  ])
    assert.ok(REMAP.includes(text), text);
});

test("[P10-deploy-docs, SV-C15, SV-C16] DEPLOY.md: Python 3.13, pyz, fork TOML without provider defaults, smoke, systemd, nginx, health, logs, upgrade", () => {
  for (const heading of [
    "1. Install Python 3.13",
    "2. Copy the pyz",
    "3. Config for the custom Qwen fork",
    "4. Smoke against the fork",
    "5. systemd unit",
    "6. nginx",
    "7. Health check",
    "8. Logs",
    "9. Upgrade",
  ])
    section(DEPLOY, heading);
  const toml = /```toml\n([\s\S]*?)```/.exec(
    section(DEPLOY, "3. Config for the custom Qwen fork"),
  )[1];
  for (const provider of ["--auth-type", "--openai-base-url", "@preset", "--model"])
    assert.ok(!toml.includes(provider), provider);
  assert.match(toml, /model = ""/);
  assert.ok(section(DEPLOY, "4. Smoke against the fork").includes("--check-agent"));
  assert.ok(section(DEPLOY, "6. nginx").includes("proxy_read_timeout 660s"));
  assert.ok(section(DEPLOY, "8. Logs").includes("journalctl -u agentic-ui"));
});

test("[DEC-057] README starts with Run locally: install, edit the local config, pnpm dev:agent-mode, the manual way", () => {
  assert.match(README, /^# agentic-ui\n\n## Run locally\n/);
  const run = section(README, "Run locally");
  const steps = run.match(/^\d\. .+$/gm) ?? [];
  assert.equal(steps.length, 3, run);
  assert.match(steps[0], /pnpm install/);
  assert.match(steps[1], /agent-server\.local\.toml.*`agent\.bin`.*`agent\.env`/);
  assert.match(steps[2], /`pnpm dev:agent-mode`.*http:\/\/127\.0\.0\.1:3458\/agent/);
  assert.ok(
    run.includes("PYTHONPATH=apps/agent-server/src python3.13 -m agentic_ui_server --config"),
    run,
  );
  assert.ok(run.includes(". scripts/workflow-env.sh && pnpm dev"), run);
});
