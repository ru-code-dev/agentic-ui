/**
 * SV-C23 / DEC-037: writes the hand-over bundle (bundle.mjs) into handover/ (root `pnpm run handover`, last step
 * of `pnpm build`), or with `--check` fails while the committed bundle differs from a fresh build (part of
 * `check:generated`). The version comes from every committed manifest (`git log -- handover/manifest.json`; the file
 * on disk in a copy without git): an unchanged contract keeps its version, new content gets the highest version
 * ever + 1 (A4-B03); `--check` also fails when the committed manifest's version breaks that rule.
 * Usage: node scripts/handover/write.mjs [--check] [--root <dir>]   (--root: a copy of the repo, for tests)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { compareGenerated, report } from "../generated/compare.ts";
import { BUNDLE_DIR, MANIFEST, buildBundle, versionProblems } from "./bundle.mjs";

const rootAt = argv.indexOf("--root");
const root = resolve(rootAt >= 0 ? argv[rootAt + 1] : fileURLToPath(new URL("../..", import.meta.url)));
const dir = join(root, BUNDLE_DIR);

function gitTopLevel() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

const inGit = gitTopLevel() === root;
const shallow = inGit && git("rev-parse", "--is-shallow-repository").trim() === "true";

/** Every committed manifest, newest first (git repo root; a shallow clone only knows its HEAD manifest, so its
 * versions are taken as committed), or the one on disk (a copy without git). */
function manifestHistory() {
  if (inGit && shallow) {
    try {
      return [JSON.parse(git("show", `HEAD:${BUNDLE_DIR}/${MANIFEST}`))];
    } catch {
      return [];
    }
  }
  if (inGit) {
    let shas = [];
    try {
      shas = git("log", "--format=%H", "--", `${BUNDLE_DIR}/${MANIFEST}`).split("\n").filter(Boolean);
    } catch {
      return [];
    }
    return shas.flatMap((sha) => {
      try {
        return [JSON.parse(git("show", `${sha}:${BUNDLE_DIR}/${MANIFEST}`))];
      } catch {
        return []; // a commit that deleted the manifest
      }
    });
  }
  const file = join(dir, MANIFEST);
  return existsSync(file) ? [JSON.parse(readFileSync(file, "utf8"))] : [];
}

/** Every file under handover/ on disk (bundle-relative). */
function filesOnDisk(at = dir) {
  if (!existsSync(at)) return [];
  return readdirSync(at, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesOnDisk(join(at, entry.name))
      : [relative(dir, join(at, entry.name)).replaceAll("\\", "/")],
  );
}

const history = manifestHistory();
const bundle = buildBundle(root, history);
const extra = filesOnDisk().filter((path) => !(path in bundle));

if (argv.includes("--check")) {
  const problems = compareGenerated(dir, bundle);
  for (const path of extra) problems.push(`${path}: not part of the bundle (run pnpm run handover)`);
  if (inGit && !shallow) problems.push(...versionProblems(history));
  report("handover", problems, Object.keys(bundle).length);
} else {
  for (const path of extra) rmSync(join(dir, path));
  for (const [path, text] of Object.entries(bundle)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const { version, contentHash } = JSON.parse(bundle[MANIFEST]);
  console.log(
    `handover: ${Object.keys(bundle).length} files, version ${version} (${contentHash.slice(0, 19)})`,
  );
}
