/**
 * DEC-045 / P10: fails a guide that names something the repo does not have. Checked: repo paths (placeholders
 * `<name>`, `*`, `NN` match any file; `dist/` build outputs need their package; `WORKFLOW/` is machine-local and
 * skipped), `pnpm` scripts (root and `--filter` packages), agent-server CLI flags and `--set` keys, TOML keys and
 * `section.key` names against apps/agent-server/agentic-ui-server.example.toml, `python -m` modules, and code
 * symbols (camelCase / PascalCase / UPPER_SNAKE spans) against the tracked sources. DOC-29: a guide inside a package
 * passes its `base` (paths and commands relative to it, the repo root as fallback); a `dist/` path in a command must
 * be a package's build output seen from the command's directory; `qwenFlags` allows the qwen CLI flags that
 * apps/agent-server/config.dev.toml passes (the server README documents them).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { codeOf, commandsOf, shellLines, tokensOf, tomlKeysOf } from "./extract.mjs";

const PNPM_BUILTINS = new Set(["install", "i", "exec", "patch", "patch-commit", "add", "dlx"]);
const COMMANDS =
  /^(pnpm|bash|node|npx|python3(\.13)?|cd|curl|git|rsync|scp|ssh|sudo|grep|"\$WORKFLOW_PYTHON"|\.|[A-Z_]+=)/;
const SETTING = /^(server|agent|timeouts|limits|repair|log)\.[a-z_]+(\.[a-z_]+)?$/;
const SYMBOL =
  /^(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*|[A-Z][A-Z0-9]*_[A-Z0-9_]+|[A-Z][a-z]{3,})$/;
const ROOT_PATH =
  /^(apps|packages|scripts|docs|handover|patches|\.githooks)\/|^(README|AGENTS|REMAP)\.md$|^(package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$/;
const PACKAGE_PATH = /^(src|examples|tests|e2e|scripts|dist)\//;
const FILE_NAME = /^[\w.-]+\.(ts|mjs|js|toml|py|sh|json)$/;

/** Everything the checks compare against, read once from `root`. */
export function repoFacts(root) {
  const list = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && existsSync(join(root, file)));
  const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const packageDirs = [
    ...new Set(list.map((f) => /^(apps|packages)\/[^/]+(?=\/)/.exec(f)?.[0]).filter(Boolean)),
  ];
  const packages = new Map(
    packageDirs
      .filter((dir) => existsSync(join(root, dir, "package.json")))
      .map((dir) => [
        json(`${dir}/package.json`).name,
        { dir, scripts: json(`${dir}/package.json`).scripts ?? {} },
      ]),
  );
  const server = "apps/agent-server/src/agentic_ui_server";
  const flags = new Set();
  for (const file of [`${server}/__main__.py`, `${server}/config.py`])
    for (const match of readFileSync(join(root, file), "utf8").matchAll(
      /add_argument\(\s*"(--[a-z-]+)"/g,
    ))
      flags.add(match[1]);
  flags.add("--help");
  // The qwen CLI flags the server passes: dev provider flags and the lean-spawn base args (settings.py).
  const qwenFlags = new Set(
    ["apps/agent-server/config.dev.toml", `${server}/settings.py`].flatMap(
      (file) => readFileSync(join(root, file), "utf8").match(/(?<=["'\s])--[a-z][a-z-]+/g) ?? [],
    ),
  );
  const example = readFileSync(
    join(root, "apps/agent-server/agentic-ui-server.example.toml"),
    "utf8",
  );
  const settings = new Set();
  for (const key of tomlKeysOf([{ lang: "toml", lines: example.split("\n") }])) {
    settings.add(key);
    settings.add(key.split(".").slice(0, -1).join("."));
  }
  const sources = list
    .filter((f) =>
      /^(apps|packages|scripts)\/.*\.(ts|tsx|mjs|js|py|sh|toml)$|^pnpm-workspace\.yaml$/.test(f),
    )
    .map((file) => readFileSync(join(root, file), "utf8"))
    .join("\n");
  const symbols = new Set(sources.match(/[A-Za-z_][A-Za-z0-9_]*/g));
  return {
    root,
    list,
    packageDirs,
    packages,
    rootScripts: json("package.json").scripts,
    flags,
    qwenFlags,
    settings,
    symbols,
    sources,
  };
}

function pathPattern(path) {
  const escaped = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const source = escaped
    .replace(/<[^>/]+>/g, "[^/]+")
    .replace(/\*/g, "[^/]*")
    .replace(/NN/g, "\\d+");
  return new RegExp(`^${source}${path.endsWith("/") ? "" : "(/|$)"}`);
}

/** `undefined` when `path` (repo-relative, may hold placeholders) exists, else the problem. */
function missingPath(facts, path) {
  const clean = normalize(path).replace(/\\/g, "/") + (path.endsWith("/") ? "/" : "");
  if (clean.startsWith("WORKFLOW/")) return undefined;
  const dist = /^(.*?)\/?(dist|dist-subpath)(\/|$)/.exec(clean);
  if (dist)
    return dist[1] === "" || existsSync(join(facts.root, dist[1]))
      ? undefined
      : `${path}: no such package`;
  if (!/[<*]|NN/.test(clean) && existsSync(join(facts.root, clean))) return undefined;
  const pattern = pathPattern(clean);
  return facts.list.some((file) => pattern.test(file)) ? undefined : `${path}: no such file`;
}

function checkPathToken(facts, token, cwd, problems, command = false) {
  if (command && /^(dist|dist-subpath)\//.test(token)) {
    // A build output named in a command: the command's directory must be a package (DOC-29).
    if (!facts.packageDirs.includes(normalize(cwd)))
      problems.push(
        `${token}: no build output in ${cwd === "." ? "the repo root" : cwd} (cd into its package)`,
      );
  } else if (ROOT_PATH.test(token)) {
    const problem = missingPath(facts, token);
    if (problem && (cwd === "." || missingPath(facts, join(cwd, token)))) problems.push(problem);
  } else if (cwd !== "." && FILE_NAME.test(token) && !command) {
    // A bare file name in a package guide's prose: a file of that package (DOC-29).
    if (!facts.list.some((file) => file.startsWith(`${cwd}/`) && file.endsWith(`/${token}`)))
      problems.push(`${token}: no such file in ${cwd}`);
  } else if (cwd !== "." && FILE_NAME.test(token)) {
    const problem = missingPath(facts, join(cwd, token));
    if (problem) problems.push(`${problem} (in ${cwd})`);
  } else if (PACKAGE_PATH.test(token)) {
    const found =
      token.startsWith("dist/") ||
      facts.packageDirs.some((dir) => !missingPath(facts, `${dir}/${token}`));
    if (!found) problems.push(`${token}: in no workspace package`);
  }
}

function checkPnpm(facts, args, problems) {
  const rest = args.filter((arg, i) => !(arg === "-s" && i === 0));
  if (rest[0] === "--filter") {
    const pkg = facts.packages.get(rest[1]);
    if (!pkg) return problems.push(`pnpm --filter ${rest[1]}: no such package`);
    const script = rest[2] === "run" ? rest[3] : rest[2];
    if (script && script !== "exec" && !(script in pkg.scripts))
      problems.push(`pnpm --filter ${rest[1]} ${script}: no such script`);
    return;
  }
  const script = rest[0] === "run" ? rest[1] : rest[0];
  if (script && !PNPM_BUILTINS.has(script) && !(script in facts.rootScripts))
    problems.push(`pnpm ${script}: no such root script`);
}

function checkModule(facts, module, cwd, problems) {
  if (!/^(agentic_ui_server|tests)(\.|$)/.test(module)) return; // the standard library (unittest, ...)
  const base = module.startsWith("agentic_ui_server") ? "apps/agent-server/src" : cwd;
  const path = `${base}/${module.replaceAll(".", "/")}`;
  if (missingPath(facts, `${path}.py`) && missingPath(facts, `${path}/__main__.py`))
    problems.push(`-m ${module}: no such module (in ${base})`);
}

/** Checks one command segment (`qwen`: the qwen CLI flags of config.dev.toml are allowed too). */
export function checkCommand(facts, { cwd, words }, problems, qwen = false) {
  if (words[0] === "pnpm") checkPnpm(facts, words.slice(1), problems);
  const server =
    words.some((w) => /agentic-ui-server\.pyz/.test(w)) || words.includes("agentic_ui_server");
  words.forEach((word, i) => {
    const flag = word.split("=")[0];
    const key = word.split("=")[0];
    if (word.includes(" "))
      for (const segment of commandsOf(word, cwd)) checkCommand(facts, segment, problems, qwen);
    else if (server && word.startsWith("--") && !facts.flags.has(flag)) {
      if (!(qwen && facts.qwenFlags.has(flag))) problems.push(`${word}: no such server flag`);
    } else if (server && words[i - 1] === "--set" && !facts.settings.has(key) && key !== "KEY")
      problems.push(`--set ${word}: no such setting`);
    else if (words[i - 1] === "-m") checkModule(facts, word, cwd, problems);
    else checkPathToken(facts, word, cwd, problems, i > 0);
  });
}

/**
 * Every problem of one guide; `allow` = tokens that name hypothetical things on purpose (examples); `base` = the
 * guide's folder (its relative paths and commands start there); `qwenFlags` = qwen CLI flags may be named.
 */
export function checkDoc(
  facts,
  markdown,
  { serverFlags = false, allow = [], base = ".", qwenFlags = false } = {},
) {
  const problems = [];
  const { inline, fences } = codeOf(markdown);
  // Names the guide's own config examples define (systemd, nginx) count as defined.
  const ownExample = new Set(
    fences.flatMap((fence) => fence.lines.join("\n").match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []),
  );
  const command = (text) => {
    for (const segment of commandsOf(text, base)) checkCommand(facts, segment, problems, qwenFlags);
  };
  for (const line of shellLines(fences)) command(line);
  for (const key of tomlKeysOf(fences))
    if (!facts.settings.has(key)) problems.push(`[toml] ${key}: no such setting`);
  for (const span of inline) {
    if (allow.includes(span)) continue;
    if (COMMANDS.test(span)) command(span);
    else if (serverFlags && span.startsWith("--")) {
      const words = ["agentic_ui_server", ...tokensOf(span)];
      checkCommand(facts, { cwd: base, words }, problems, qwenFlags);
    } else if (SETTING.test(span) && !FILE_NAME.test(span)) {
      if (!facts.settings.has(span) && !facts.sources.includes(`"${span}"`))
        problems.push(`${span}: no such setting or name`);
    } else if (SYMBOL.test(span.replace(/\(.*\)$/, ""))) {
      const symbol = span.replace(/\(.*\)$/, "");
      if (!facts.symbols.has(symbol) && !ownExample.has(symbol))
        problems.push(`${symbol}: no such symbol in the sources`);
    } else for (const token of tokensOf(span)) checkPathToken(facts, token, base, problems);
  }
  // `allow` also covers command words and file names (a user's own `my.toml`, an external checkout's file).
  const allowed = (problem) =>
    allow.some((name) => problem.startsWith(`${name}:`) || problem.includes(`/${name}:`));
  return [...new Set(problems)].filter((problem) => !allowed(problem));
}
