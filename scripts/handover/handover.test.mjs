// SV-C23 / DEC-024 / DEC-037: the generated, versioned hand-over bundle. Run: node --test scripts/handover/*.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildBundle, contentHash, nextVersion } from "./bundle.mjs";
import { MERGE_CHECKS, MESSAGE_CHECKS, TREE_CHECKS } from "./bundle-readme.mjs";
import { bundleValidator } from "./bundle-validator.mjs";
import { runCases } from "./run-cases.mjs";
import { registerA4fTests } from "./handover-a4f.test.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
registerA4fTests();
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha = (text) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
const committed = readJson(join(root, "handover/manifest.json"));
/** Every example file (compositions + one snippet per component): the count follows the examples folder. */
const EXAMPLE_COUNT = ["compositions", "components"]
  .flatMap((group) => readdirSync(join(root, "packages/ui-kit-one-catalog/examples", group)))
  .filter((name) => name.endsWith(".json")).length;

test("[SV-C23] the bundle holds the contract, prompt, examples, fallback, validator cases, HTTP contract and a manifest", () => {
  const bundle = buildBundle(root, [committed]);
  const paths = Object.keys(bundle);
  for (const path of ["catalog.json", "system-prompt.md", "fallback.json", "SERVER-CONTRACT.md", "manifest.json"])
    assert.ok(paths.includes(path), path);
  assert.ok(paths.includes("validator-cases/cases.json"));
  for (const path of ["schemas/common_types.json", "schemas/server_to_client.json", "scripts/bundle-validator.mjs"])
    assert.ok(paths.includes(path), path);
  assert.equal(paths.filter((path) => /^examples\/[^/]+\.json$/.test(path)).length, EXAMPLE_COUNT);
  const manifest = JSON.parse(bundle["manifest.json"]);
  assert.equal(manifest.catalogId, "urn:agentic-ui:catalog:ui-kit-one:v1");
  assert.equal(manifest.a2uiVersion, "v0.9");
  assert.match(manifest.contractVersion, /^urn:agentic-ui:catalog:ui-kit-one:v1 sha256:[0-9a-f]{12}$/);
  assert.deepEqual(Object.keys(manifest.files), paths.filter((p) => p !== "manifest.json").toSorted());
  for (const [path, hash] of Object.entries(manifest.files)) assert.equal(hash, sha(bundle[path]), path);
  assert.equal(manifest.contentHash, contentHash(manifest.files));
});

test("[SV-C23] the committed bundle is fresh (handover/ equals a rebuild)", () => {
  const bundle = buildBundle(root, [committed]);
  for (const [path, text] of Object.entries(bundle))
    assert.equal(readFileSync(join(root, "handover", path), "utf8"), text, path);
});

const requireAjv = createRequire(join(root, "packages/ui-kit-one-catalog/package.json"));

test("[SV-C23] a production validator built from the bundle alone gives every validator case its verdict", () => {
  // A3-09 / SV-C28: bundle-validator.mjs follows README steps 1-5 with handover/ files only, one chat per case from
  // an empty state (A4b-H2: before, follow-up cases were valid only for a stateless validator).
  const { cases, steps, wrong, rules } = runCases(join(root, "handover"), requireAjv);
  assert.deepEqual(wrong.slice(0, 3), [], `${wrong.length} of ${steps} steps disagree`);
  assert.ok(cases >= EXAMPLE_COUNT && steps > cases, `${cases} chats, ${steps} steps`);
  const vectors = new Set(["proto-key", "template-path"]); // no case holds them: handover-a4f.test.mjs vectors
  const listed = [...Object.keys(MESSAGE_CHECKS), ...Object.keys(MERGE_CHECKS), ...Object.keys(TREE_CHECKS)];
  assert.deepEqual(listed.filter((rule) => !rules.has(rule) && !vectors.has(rule)), [], "every README rule is hit");
});

test("[SV-C23] the bundle-only validator rejects the A3 review's three payloads (path, call depth, nested call)", () => {
  const validator = bundleValidator(join(root, "handover"), requireAjv);
  const validate = (messages) => validator.chat().check(messages);
  const catalogId = "urn:agentic-ui:catalog:ui-kit-one:v1";
  const surface = (rootComponent) => [
    { version: "v0.9", createSurface: { surfaceId: "s", catalogId } },
    { version: "v0.9", updateComponents: { surfaceId: "s", components: [rootComponent] } },
  ];
  let call = { path: "/name" };
  for (let i = 0; i < 6; i++) call = { call: "formatString", args: { value: call } };
  const event = { event: { name: "report.export", context: { function: "csv" } } };
  const verdicts = {
    "path-tilde": validate(surface({ id: "root", component: "Text", text: { path: "/a~2b" } })),
    "deep-calls": validate(surface({ id: "root", component: "Text", text: call })),
    "context-key-function": validate(surface({ id: "root", component: "Button", label: "Экспорт", action: event })),
  };
  for (const [rule, problems] of Object.entries(verdicts)) assert.deepEqual([...new Set(problems.map((p) => p.rule))], [rule]);
});

test("[DEC-037] the version is a counter that moves only with the content hash", () => {
  assert.equal(nextVersion("sha256:a", []), 1);
  assert.equal(nextVersion("sha256:a", [{ version: 4, contentHash: "sha256:a" }]), 4);
  assert.equal(nextVersion("sha256:b", [{ version: 4, contentHash: "sha256:a" }]), 5);
  const reverted = [
    { version: 10, contentHash: "sha256:a" },
    { version: 11, contentHash: "sha256:b" },
    { version: 10, contentHash: "sha256:a" },
  ];
  assert.equal(nextVersion("sha256:c", reverted), 12, "after a revert the next content is 12, not a second 11");
  assert.equal(nextVersion("sha256:b", reverted), 11, "content seen before keeps its version");
});

/** A copy of the bundle's inputs (contract package with its node_modules linked, server sources, handover/). */
function repoCopy() {
  const tmp = mkdtempSync(join(root, "WORKFLOW/tmp/handover-test-"));
  const copy = (path) => cpSync(join(root, path), join(tmp, path), { recursive: true });
  for (const path of ["pnpm-workspace.yaml", "handover", "scripts/handover", "scripts/generated"]) copy(path);
  const catalog = "packages/ui-kit-one-catalog";
  for (const path of ["src", "scripts", "examples", "package.json"]) copy(`${catalog}/${path}`);
  symlinkSync(join(root, catalog, "node_modules"), join(tmp, catalog, "node_modules"), "dir");
  const server = "apps/agent-server";
  // src/ and tests/ in full: check-generated.mjs runs the Python generators (A3-29)
  for (const path of ["scripts", "src", "tests", "fallback.json", "validator-cases", "SERVER-CONTRACT.md"])
    copy(`${server}/${path}`);
  return tmp;
}

const run = (tmp, ...args) =>
  spawnSync(process.execPath, ["--no-warnings", join(tmp, "scripts/handover/write.mjs"), "--root", tmp, ...args], {
    encoding: "utf8",
  });

test("[DEC-037, SV-C23] a token edit in a temp copy regenerates the contract and bumps the version once (DEC-056: the server's contractVersion follows)", () => {
  const tmp = repoCopy();
  try {
    assert.equal(run(tmp, "--check").status, 0, "an untouched copy is fresh");
    const radii = join(tmp, "packages/ui-kit-one-catalog/src/tokens/radii.ts");
    const source = readFileSync(radii, "utf8");
    assert.ok(source.includes('full: "9999px",'));
    writeFileSync(radii, source.replace('full: "9999px",', 'full: "9999px",\n  huge: "4rem",'));
    execFileSync(process.execPath, ["--no-warnings", join(tmp, "apps/agent-server/scripts/sync_data.mjs")]);

    const stale = run(tmp, "--check");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /catalog\.json: stale/);
    assert.match(stale.stderr, /manifest\.json: stale/);

    assert.equal(run(tmp).status, 0);
    const bumped = readJson(join(tmp, "handover/manifest.json"));
    assert.equal(bumped.version, committed.version + 1);
    assert.notEqual(bumped.contentHash, committed.contentHash);
    assert.notEqual(bumped.contractVersion, committed.contractVersion);
    const served = (dir) =>
      readJson(join(dir, "apps/agent-server/src/agentic_ui_server/data/contract-version.json")).contractVersion;
    assert.equal(served(root), committed.contractVersion, "the server answers with the committed contract");
    assert.equal(served(tmp), bumped.contractVersion, "after the sync the server answers with the new one");
    assert.ok(readFileSync(join(tmp, "handover/catalog.json"), "utf8").includes('"huge"'));
    const changed = Object.keys(bumped.files).filter((p) => bumped.files[p] !== committed.files[p]);
    assert.deepEqual(changed, ["catalog.json", "system-prompt.md"]);

    assert.equal(run(tmp).status, 0, "rebuild without a change");
    assert.equal(readJson(join(tmp, "handover/manifest.json")).version, bumped.version);
    assert.equal(run(tmp, "--check").status, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("[SV-C23] --check fails on a hand-edited or an extra bundle file", () => {
  const tmp = repoCopy();
  try {
    writeFileSync(join(tmp, "handover/fallback.json"), "[]\n");
    mkdirSync(join(tmp, "handover/examples"), { recursive: true });
    writeFileSync(join(tmp, "handover/examples/stray.json"), "{}\n");
    const result = run(tmp, "--check");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fallback\.json: stale/);
    assert.match(result.stderr, /examples\/stray\.json: not part of the bundle/);
    assert.equal(run(tmp).status, 0);
    assert.equal(run(tmp, "--check").status, 0, "a rebuild removes the stray file and restores the copy");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("[SV-C23, DEC-034] a foreign file in validator-cases/ stays out of handover/", () => {
  const tmp = repoCopy();
  try {
    writeFileSync(join(tmp, "apps/agent-server/validator-cases/notes.json"), "{}\n");
    assert.equal(run(tmp).status, 0);
    assert.ok(!existsSync(join(tmp, "handover/validator-cases/notes.json")), "copied into the bundle");
    assert.equal(run(tmp, "--check").status, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("[DEC-034] a foreign file in the server data/ fails check:generated and pnpm build's sync prunes it", () => {
  const tmp = repoCopy();
  const server = (script) =>
    spawnSync(process.execPath, ["--no-warnings", join(tmp, "apps/agent-server/scripts", script)], {
      encoding: "utf8",
    });
  try {
    const data = join(tmp, "apps/agent-server/src/agentic_ui_server/data");
    assert.equal(server("check-generated.mjs").status, 0, "an untouched copy is fresh");
    writeFileSync(join(data, "extra.json"), "{}\n");
    writeFileSync(join(tmp, "apps/agent-server/validator-cases/notes.json"), "{}\n");
    const stale = server("check-generated.mjs");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /data\/extra\.json: not generated, would ship in the pyz/);
    assert.match(stale.stderr, /validator-cases\/notes\.json: not part of the validator cases/);
    assert.equal(server("sync_data.mjs").status, 0);
    assert.ok(!existsSync(join(data, "extra.json")), "sync_data.mjs prunes it");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("[DEC-034, SV-C23] pnpm build writes every generated file before the pyz and handover/ copy it", () => {
  const { scripts } = readJson(join(root, "package.json"));
  const steps = scripts.build.split(" && ");
  const at = (step) => steps.findIndex((s) => s.includes(step));
  const order = ["vp run -r build", "sync_data.mjs", "server-generate.sh", "server-build.sh", "handover/write.mjs"];
  assert.deepEqual(order.map(at), order.map(at).toSorted((a, b) => a - b), scripts.build);
  assert.ok(order.every((step) => at(step) >= 0), scripts.build);
  const generate = readFileSync(join(root, "scripts/server-generate.sh"), "utf8");
  for (const module of ["validator_cases --write", "conversation.fallback --write", "http.contract_doc --write"])
    assert.ok(generate.includes(module), module);
  const react = readJson(join(root, "packages/ui-kit-one-react/package.json"));
  assert.match(react.scripts.build, /tsdown && node scripts\/build-mapping\.ts/, "the renderer build writes MAPPING.md");
});

// A4F titles (closed reports cite the two titles above, which stay stable).
test("[SV-C23, SV-C28, A4b-H2, A4-B02] the bundle-only validator gives every step of every validator chat its verdict", () => {
  const { steps, wrong } = runCases(join(root, "handover"), requireAjv);
  assert.ok(steps > 0);
  assert.deepEqual(wrong, []);
});

test("[DEC-037, A4-B03] the version moves only with the content hash, never reused for other content", () => {
  assert.equal(nextVersion("sha256:c", [{ version: 4, contentHash: "sha256:a" }, { version: 7, contentHash: "sha256:b" }]), 8);
  assert.equal(nextVersion("sha256:a", [{ version: 7, contentHash: "sha256:b" }, { version: 4, contentHash: "sha256:a" }]), 4);
});
