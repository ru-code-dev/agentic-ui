/**
 * DEC-028 report parser: splits a report into the title, `## ` sections and `- ` entries (with line
 * numbers) and flags every line that is neither (free prose). Fenced blocks are skipped verbatim.
 */

export const SECTIONS = [
  "meta",
  "commits",
  "requirements",
  "tests",
  "measurements",
  "decisions",
  "deviations",
  "open_issues",
  "files",
  "how_to_run",
  "handoff",
];

const FENCE = /^\s*```/;
const SECTION = /^## (\S.*)$/;

/**
 * @param {string} text report contents
 * @returns {{ title: string | null, sections: { name: string, line: number, entries: { line: number, text: string }[] }[], problems: { line: number, message: string }[] }}
 */
export function parseReport(text) {
  const lines = text.split("\n");
  const problems = [];
  const sections = [];
  let title = null;
  let current = null;
  let fenceStart = 0;
  lines.forEach((raw, index) => {
    const line = index + 1;
    if (FENCE.test(raw)) {
      fenceStart = fenceStart ? 0 : line;
      return;
    }
    if (fenceStart || raw.trim() === "") return;
    if (index === 0 && raw.startsWith("# ")) {
      title = raw.slice(2).trim();
      return;
    }
    const heading = SECTION.exec(raw);
    if (heading) {
      current = { name: heading[1].trim(), line, entries: [] };
      sections.push(current);
      return;
    }
    if (raw.startsWith("#")) {
      problems.push({ line, message: 'unexpected heading (only the title and "## <section>")' });
      return;
    }
    if (raw.startsWith("- ") && raw.slice(2).trim() !== "") {
      if (current) current.entries.push({ line, text: raw.slice(2).trim() });
      else problems.push({ line, message: "entry before the first section" });
      return;
    }
    problems.push({
      line,
      message: 'free prose line (every line must be a heading or one "- " entry)',
    });
  });
  if (fenceStart) problems.push({ line: fenceStart, message: "unclosed code fence" });
  return { title, sections, problems };
}

/**
 * Splits an entry into its ` | `-separated fields (trimmed).
 * @param {string} text
 */
export function fields(text) {
  return text.split(" | ").map((field) => field.trim());
}

/**
 * The value of the first field starting with `<name>:` (rest of the entry for `evidence`, which is
 * always the tail), or null.
 * @param {string} text
 * @param {string} name
 */
export function field(text, name) {
  if (name === "evidence") {
    const match = /(?:^|\s\|\s)evidence:(.*)$/.exec(text);
    return match ? match[1].trim() : null;
  }
  const found = fields(text).find((value) => value.startsWith(`${name}:`));
  return found === undefined ? null : found.slice(name.length + 1).trim();
}
