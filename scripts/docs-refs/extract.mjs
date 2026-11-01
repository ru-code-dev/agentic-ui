/**
 * DEC-045 / P10: what a guide (README.md, AGENTS.md, REMAP.md, docs/server/DEPLOY.md) names in code: inline code
 * spans and fenced blocks, split into shell command segments, TOML keys and single tokens. check.mjs verifies
 * every one against the repo.
 */

/** `{ inline: string[], fences: { lang, lines }[] }` of a markdown text. */
export function codeOf(markdown) {
  const fences = [];
  const prose = [];
  let fence;
  for (const line of markdown.split("\n")) {
    const open = /^```(\S*)\s*$/.exec(line);
    if (fence === undefined && open) fence = { lang: open[1] || "text", lines: [] };
    else if (fence !== undefined && /^```\s*$/.test(line)) {
      fences.push(fence);
      fence = undefined;
    } else if (fence !== undefined) fence.lines.push(line);
    else prose.push(line);
  }
  const inline = [...prose.join("\n").matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
  return { inline, fences };
}

/** A shell line without its trailing comment. */
const stripComment = (line) => line.replace(/(^|\s)#.*$/, "").trim();

/**
 * Shell command segments of a line or span: split on `&&`, `||`, `;`, `|`; a leading `cd <dir>` sets the
 * directory of the following segments. Returns `{ cwd, words }[]` (quotes kept off the words).
 */
export function commandsOf(text, cwd = ".") {
  const segments = [];
  let dir = cwd;
  for (const part of stripComment(text).split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    const words = part.match(/'[^']*'|"[^"]*"|\S+/g) ?? [];
    const plain = words.map((word) => word.replace(/^(['"])(.*)\1$/, "$2"));
    while (/^[A-Z_][A-Z0-9_]*=/.test(plain[0] ?? "") || plain[0] === "env" || plain[0] === "sudo")
      plain.shift();
    if (plain[0] === "cd" && plain[1]) {
      dir = plain[1];
      continue;
    }
    if (plain.length > 0) segments.push({ cwd: dir, words: plain });
  }
  return segments;
}

/** Shell lines of the `sh`/`text`-less command fences (a trailing `\` joins lines). */
export function shellLines(fences) {
  const lines = [];
  for (const fence of fences.filter((f) => f.lang === "sh" || f.lang === "bash")) {
    let pending = "";
    for (const line of fence.lines) {
      const text = pending + line;
      if (/\\\s*$/.test(line)) pending = text.replace(/\\\s*$/, " ");
      else {
        lines.push(text);
        pending = "";
      }
    }
  }
  return lines;
}

/** `section.key` of every assignment in the TOML fences (inline tables count as their key). */
export function tomlKeysOf(fences) {
  const keys = [];
  for (const fence of fences.filter((f) => f.lang === "toml")) {
    let section = "";
    for (const line of fence.lines) {
      const header = /^\s*\[([^\]]+)\]/.exec(line);
      const assignment = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (header) section = header[1].trim();
      else if (assignment) keys.push(section ? `${section}.${assignment[1]}` : assignment[1]);
    }
  }
  return keys;
}

/** Whitespace-separated tokens of an inline span, without surrounding quotes and punctuation. */
export const tokensOf = (span) =>
  span
    .split(/\s+/)
    .map((token) => token.replace(/^[("'`]+|[)"'`,:;.]+$/g, ""))
    .filter(Boolean);
