// A4F hand-over fixes (imported by handover.test.mjs): stateful recipe rules, prototype names, versions, README paths.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { versionProblems } from "./bundle.mjs";
import { bundleValidator } from "./bundle-validator.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const validator = bundleValidator(join(root, "handover"), createRequire(join(root, "packages/ui-kit-one-catalog/package.json")));
const catalogId = "urn:agentic-ui:catalog:ui-kit-one:v1";
const v = "v0.9";
const create = (sid = "s") => ({ version: v, createSurface: { surfaceId: sid, catalogId } });
const comps = (components, sid = "s") => ({ version: v, updateComponents: { surfaceId: sid, components } });
const del = (sid = "s") => ({ version: v, deleteSurface: { surfaceId: sid } });
const text = (id, value = "a") => ({ id, component: "Text", text: value });
const BASE = [create(), comps([text("root")])];
const list = (path) => ({ id: "root", component: "List", children: { componentId: "t", path } });
const pattern = (path) => new RegExp(`(^|/)${path.replaceAll(".", "\\.").replaceAll("*", "[^/]+")}$`);
/** The rule ids of each step of one chat. */
const chat = (...steps) => {
  const session = validator.chat();
  return steps.map((messages) => [...new Set(session.check(messages).map((p) => p.rule))].toSorted());
};

/** Registered by handover.test.mjs (one test file in `pnpm test:scripts`). */
const m = (version, contentHash) => ({ version, contentHash });

export function registerA4fTests() {
test("[A4-32] prototype-named calls and component types get a verdict, never a TypeError", () => {
  const vectors = [
    { id: "root", component: "Text", text: { call: "toString", args: {} } },
    { id: "root", component: "Text", text: { call: "constructor", args: {} } },
    { id: "root", component: "toString" },
    { id: "root", component: "constructor" },
    { id: "root", component: { toString: 1 } },
    { id: "root", component: "__proto__", children: ["x"] },
  ];
  for (const component of vectors) {
    const [rules] = chat([create(), comps([component])]);
    assert.ok(rules.length > 0, JSON.stringify(component));
  }
});

test("[SV-C28, A4-29, A4-27, A4-30] the static project rules are each the only reason of a vector", () => {
  const proto = JSON.parse('{"id": "root", "component": "Text", "text": "a", "__proto__": "x"}');
  assert.deepEqual(chat([create(), comps([proto])]), [["proto-key", "schema"]]);
  assert.deepEqual(chat([create(), comps([list(""), text("t")])]), [["template-array", "template-path"]]);
  assert.deepEqual(chat([create(), comps([text("root", { path: "/constructor" })])]), [["forbidden-segment"]]);
  assert.deepEqual(chat([create(" "), comps([text("root")], " ")]), [["blank-surface-id"]]);
});

test("[SV-C28, A4-B01, A4-B02] no assumed surface: a first reply that only updates and a message after the delete fail", () => {
  assert.deepEqual(chat([comps([text("root")])]), [["update-before-create"]]);
  assert.deepEqual(chat(BASE, [del()], [comps([text("root")])]), [[], [], ["update-before-create"]]);
  assert.deepEqual(chat(BASE, [del(), comps([text("root")])]), [[], ["update-before-create"]]);
  assert.deepEqual(chat(BASE, [del(), create(), comps([text("root")])]), [[], []], "delete-then-create recreates");
  assert.deepEqual(chat(BASE, [del("nope")]), [[], []], "deleting a surface that is not shown is a no-op");
  assert.deepEqual(chat(BASE, [create()]), [[], ["create-twice"]]);
  assert.deepEqual(chat(BASE, [comps([{ id: "root", text: "b" }])]), [[], []], "a partial update keeps the type");
  assert.deepEqual(chat(BASE, [comps([{ id: "root", component: "Flex", children: ["x"] }])], [comps([text("x")])]),
    [[], ["dangling-child"], ["orphan"]], "a rejected reply leaves the state as it was");
});

test("[A4b-H1] the tree is at most 50 levels below root (root = level 0)", () => {
  const chain = (depth) => {
    const ids = ["root", ...Array.from({ length: depth }, (_, i) => `n${i + 1}`)];
    return [...ids.slice(0, -1).map((id, i) => ({ id, component: "Box", children: [ids[i + 1]] })), text(ids.at(-1))];
  };
  assert.deepEqual(chat([create(), comps(chain(50))]), [[]]);
  assert.deepEqual(chat([create(), comps(chain(51))]), [["tree-depth"]]);
});

test("[A4-B04] every path the README names is a file of the bundle", () => {
  const manifest = JSON.parse(readFileSync(join(root, "handover/manifest.json"), "utf8"));
  const files = [...Object.keys(manifest.files), "manifest.json"];
  const readme = readFileSync(join(root, "handover/README.md"), "utf8");
  const named = [...readme.matchAll(/`([A-Za-z][\w.*-]*(?:\/[\w.*-]+)*\.(?:json|md|mjs))`/g)].map((m) => m[1]);
  const exists = (path) => files.some((f) => (path.includes("/") ? f.match(pattern(path))?.index === 0 : pattern(path).test(f)));
  assert.ok(named.includes("scripts/bundle-validator.mjs") && named.includes("scripts/run-cases.mjs"));
  assert.deepEqual(named.filter((path) => !exists(path)), []);
});

/** A git repo holding only what write.mjs reads (sources of the bundle + handover/). */
function gitCopy() {
  const tmp = mkdtempSync(join(root, "WORKFLOW/tmp/handover-git-"));
  const server = "apps/agent-server";
  for (const path of ["handover", "scripts/handover", "scripts/generated", "packages/ui-kit-one-catalog/examples",
    `${server}/src/agentic_ui_server/data`, `${server}/fallback.json`, `${server}/SERVER-CONTRACT.md`, `${server}/validator-cases`])
    cpSync(join(root, path), join(tmp, path), { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: tmp, encoding: "utf8" });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "base", "--no-verify");
  const write = (...args) =>
    spawnSync(process.execPath, ["--no-warnings", join(tmp, "scripts/handover/write.mjs"), ...args], { cwd: tmp, encoding: "utf8" });
  const commit = (message) => (git("add", "-A"), git("commit", "-qm", message, "--no-verify"));
  const manifest = () => JSON.parse(readFileSync(join(tmp, "handover/manifest.json"), "utf8"));
  return { tmp, write, commit, manifest };
}

test("[A4-B03, DEC-037] a revert never makes two bundles share a version; tampered versions fail --check", () => {
  const { tmp, write, commit, manifest } = gitCopy();
  const notes = join(tmp, "apps/agent-server/validator-cases/README.md");
  const original = readFileSync(notes, "utf8");
  try {
    const base = manifest().version;
    assert.equal(write("--check").status, 0, "an untouched copy is fresh");
    writeFileSync(notes, `${original}\nchange 1\n`);
    assert.equal(write().status, 0);
    commit("change 1");
    assert.equal(manifest().version, base + 1);
    writeFileSync(notes, original);
    assert.equal(write().status, 0);
    commit("revert");
    assert.equal(manifest().version, base, "the reverted content keeps its first version");
    writeFileSync(notes, `${original}\nchange 2\n`);
    assert.equal(write().status, 0);
    commit("change 2");
    assert.equal(manifest().version, base + 2, "new content after a revert: highest version ever + 1");
    assert.equal(write("--check").status, 0);
    const edited = readFileSync(join(tmp, "handover/manifest.json"), "utf8");
    writeFileSync(join(tmp, "handover/manifest.json"), edited.replace(`"version": ${base + 2},`, '"version": 3,'));
    commit("hand-edited version");
    assert.equal(write("--check").status, 1, "a hand-edited committed version fails");
    writeFileSync(join(tmp, "handover/manifest.json"), edited);
    commit("restore");
    writeFileSync(notes, `${original}\nchange 3\n`);
    assert.equal(write().status, 0);
    const bumped = readFileSync(join(tmp, "handover/manifest.json"), "utf8");
    writeFileSync(join(tmp, "handover/manifest.json"), bumped.replace(`"version": ${base + 3},`, `"version": ${base + 2},`));
    commit("content change without a bump");
    const check = write("--check");
    assert.equal(check.status, 1, "a committed content change without a bump fails");
    assert.match(check.stderr + check.stdout, /the history says/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("[A4-B03, DEC-068] a squashed history keeps a committed version valid; reuse and lowering still fail", () => {
  assert.deepEqual(versionProblems([m(12, "sha256:c"), m(7, "sha256:a")]), [], "versions 8..11 left with the squash");
  assert.equal(versionProblems([m(7, "sha256:c"), m(7, "sha256:a")]).length, 1, "a version reused for other content");
  assert.equal(versionProblems([m(5, "sha256:c"), m(7, "sha256:a")]).length, 1, "a lowered version");
  assert.equal(versionProblems([m(9, "sha256:a"), m(8, "sha256:b"), m(4, "sha256:a")]).length, 1, "seen content keeps its version");
});
}
