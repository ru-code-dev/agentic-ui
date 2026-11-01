/**
 * DEC-032: requirement IDs as written in the source documents. INTENT §2 table rows (`| SV-Cn | … |`),
 * SPEC table rows (`| EX-nn | …`, `| PG-nn |`, `| PR-nn |`, `| DOC-nn |`) and SPEC intent bullets
 * (`- INT-nn …`). Every one of them must be classified in docs/TRACEABILITY.ids.json.
 */

const ROW = {
  INTENT: /^\|\s*(SV-C\d+)\s*\|(.*)$/,
  SPEC: /^\|\s*((?:EX|PG|PR|DOC)-\d+b?)\s*\|(.*)$/,
};
const BULLET = /^- (INT-\d+) (.+)$/;
const TITLE_MAX = 90;

/** Plain one-line title from the rest of a table row or bullet. */
export function cleanTitle(rest) {
  const text = rest
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean)
    .join(" · ")
    .replaceAll(/\*\*|`/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
}

/** IDs of one document: `[{ id, source, title }]` in document order, first occurrence wins. */
export function parseSource(source, text) {
  const found = new Map();
  for (const line of text.split("\n")) {
    const row = ROW[source]?.exec(line);
    const bullet = source === "SPEC" ? BULLET.exec(line) : null;
    const match = row ?? bullet;
    if (match && !found.has(match[1]))
      found.set(match[1], { id: match[1], source, title: cleanTitle(match[2]) });
  }
  return [...found.values()];
}

/** IDs of INTENT + SPEC. `docs` = `{ INTENT: text, SPEC: text }`. */
export function sourceIds(docs) {
  return Object.entries(docs).flatMap(([source, text]) => parseSource(source, text));
}
