/**
 * SV-C23 / DEC-024 / DEC-037: the hand-over bundle for the production team, generated, never hand-edited.
 * `buildBundle(root, previous)` = bundle-relative path → text of every file in handover/: the contract and its
 * prompt exactly as the agent server bundles them, every example, the fallback surface, the validator cases, the
 * HTTP contract, the validator recipe's scripts, a README (bundle-readme.mjs) and manifest.json (version,
 * catalogId, contract version, sha256 per file). The version follows the content hash over the whole manifest
 * history (A4-B03): an unseen hash gets the highest version ever + 1, a hash seen before its first version again,
 * so two different bundles never share a version (DEC-037: no changelog, drop in the files when it changes).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readme } from "./bundle-readme.mjs";

export const BUNDLE_DIR = "handover";
export const MANIFEST = "manifest.json";

const SERVER = "apps/agent-server";
/** The agent server's validator-cases folder and the only files of it the bundle takes (cases.json is generated). */
export const VALIDATOR_CASES_DIR = "validator-cases";
export const VALIDATOR_CASES_FILES = ["README.md", "cases.json"];
const EXAMPLES = "packages/ui-kit-one-catalog/examples";
/** The recipe validator, shipped so the README names only bundle files (A4-B04); it needs ajv + ajv-formats. */
export const SHIPPED_SCRIPTS = ["bundle-validator.mjs", "bundle-state.mjs", "bundle-topology.mjs", "run-cases.mjs"];

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const sortedFiles = (root, dir) =>
  readdirSync(join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .toSorted();

/** Bundle path → repo-relative source path. Every source is itself generated and stale-checked; a foreign file
 * next to a source (e.g. in validator-cases/) is never taken. */
export function bundleSources(root) {
  const sources = {
    "catalog.json": `${SERVER}/src/agentic_ui_server/data/catalog.json`,
    "system-prompt.md": `${SERVER}/src/agentic_ui_server/data/system-prompt.md`,
    "fallback.json": `${SERVER}/fallback.json`,
    "SERVER-CONTRACT.md": `${SERVER}/SERVER-CONTRACT.md`,
    "schemas/common_types.json": `${SERVER}/src/agentic_ui_server/data/common_types.json`,
    "schemas/server_to_client.json": `${SERVER}/src/agentic_ui_server/data/server_to_client.json`,
  };
  for (const name of SHIPPED_SCRIPTS) sources[`scripts/${name}`] = `scripts/handover/${name}`;
  for (const name of VALIDATOR_CASES_FILES)
    sources[`${VALIDATOR_CASES_DIR}/${name}`] = `${SERVER}/${VALIDATOR_CASES_DIR}/${name}`;
  for (const group of ["compositions", "components"]) {
    for (const name of sortedFiles(root, `${EXAMPLES}/${group}`).filter((n) => n.endsWith(".json"))) {
      const path = `examples/${name}`;
      if (path in sources) throw new Error(`hand-over: two examples named ${name}`);
      sources[path] = `${EXAMPLES}/${group}/${name}`;
    }
  }
  return sources;
}

/** Hash of the whole content: sha256 over `<sha256>  <path>` lines in path order. */
export function contentHash(fileHashes) {
  const lines = Object.entries(fileHashes)
    .map(([path, hash]) => `${hash.replace("sha256:", "")}  ${path}\n`)
    .join("");
  return `sha256:${sha256(lines)}`;
}

/** A4-B03: the version for `hash` given every earlier manifest (any order): the first version that carried
 * `hash`, else the highest version ever + 1 (1 for a first build). */
export function nextVersion(hash, history = []) {
  const seen = history.filter((m) => m?.contentHash === hash).map((m) => m.version);
  if (seen.length > 0) return Math.min(...seen);
  return Math.max(0, ...history.map((m) => m?.version ?? 0)) + 1;
}

/** A4-B03: problems of the newest committed manifest against the ones before it (newest first): a hand-edited
 * version, a content change without a bump, a version reused for other content. New content may skip versions
 * (a squashed history drops the manifests that used them); it must only exceed every earlier version. */
export function versionProblems(newestFirst) {
  const [head, ...earlier] = newestFirst;
  if (!head || earlier.length === 0) return []; // a first committed manifest is taken as committed
  const expected = nextVersion(head.contentHash, earlier);
  const seen = earlier.some((m) => m?.contentHash === head.contentHash);
  if (seen ? head.version === expected : head.version >= expected) return [];
  const says = seen ? `${expected}` : `>= ${expected}`;
  return [`manifest.json: committed version ${head.version} for ${head.contentHash.slice(0, 19)}, the history says ${says}`];
}

/** Every bundle file (path → text), manifest included; `history` = every earlier manifest (nextVersion). */
export function buildBundle(root, history = []) {
  const files = {};
  for (const [path, source] of Object.entries(bundleSources(root)))
    files[path] = readFileSync(join(root, source), "utf8");
  const catalog = files["catalog.json"];
  const { catalogId } = JSON.parse(catalog);
  const a2uiVersion = JSON.parse(files["fallback.json"])[0].version;
  files["README.md"] = readme(Object.keys(files), catalogId);

  const paths = Object.keys(files).toSorted();
  const hashes = Object.fromEntries(paths.map((path) => [path, `sha256:${sha256(files[path])}`]));
  const hash = contentHash(hashes);
  const manifest = {
    $comment:
      "Generated by pnpm build (scripts/handover/write.mjs). version: a new contentHash gets the highest version " +
      "ever + 1, a contentHash seen before keeps its first version.",
    bundle: "agentic-ui-handover",
    version: nextVersion(hash, history),
    contentHash: hash,
    catalogId,
    contractVersion: `${catalogId} sha256:${sha256(catalog).slice(0, 12)}`,
    a2uiVersion,
    referenceServer: "apps/agent-server (agentic-ui-server.pyz)",
    files: hashes,
  };
  files[MANIFEST] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
}
