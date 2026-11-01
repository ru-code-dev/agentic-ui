/**
 * DEC-028 report rules: file name, title, sections (presence, order, `- none`), per-section entry
 * shape, evidence pointers (evidence.mjs), secret scan. DEC-068: no run dumps; `commit:` / `run:` are
 * informational text.
 */
import { basename } from "node:path";
import { evidenceProblems, fileProblem, secretLines, unquote } from "./evidence.mjs";
import { SECTIONS, field, fields, parseReport } from "./parse.mjs";

const NAME = /^docs\/server\/reports\/info-([A-Z][A-Z0-9]*)(?:-[A-Za-z0-9]+(?:-[a-z0-9]+)*)?\.md$/;
const EVIDENCE = new Set([
  "requirements",
  "measurements",
  "decisions",
  "deviations",
  "open_issues",
  "handoff",
]);
const META = ["phase", "title", "date", "status", "brief"];
const STATES = new Set(["done", "partial", "not-done"]);
const SEVERITIES = new Set(["blocker", "major", "minor"]);
export const COUNTS = /\b(\d+)\/(\d+) passed, (\d+) skipped, (\d+) failed\b/;

const need = (ctx, entry, name, extra = "") =>
  field(entry.text, name) ? true : ctx.add(entry.line, `missing "${name}:" field${extra}`);

function checkMeta(entries, ctx) {
  const seen = new Map();
  for (const { line, text } of entries) {
    const match = /^([a-z_]+):\s*(.*)$/.exec(text);
    if (!match || !META.includes(match[1]))
      ctx.add(line, `meta entry must be one of ${META.map((k) => `"${k}: …"`).join(", ")}`);
    else if (seen.has(match[1])) ctx.add(line, `duplicate meta "${match[1]}"`);
    else seen.set(match[1], { line, value: match[2].trim() });
  }
  for (const key of META)
    if (!seen.get(key)?.value) ctx.add(ctx.metaLine, `meta "${key}" missing or empty`);
  const phase = seen.get("phase");
  if (phase?.value && ctx.phase && phase.value !== ctx.phase)
    ctx.add(phase.line, `meta phase "${phase.value}" must be "${ctx.phase}" (file name)`);
  const date = seen.get("date");
  if (
    date?.value &&
    !(/^\d{4}-\d{2}-\d{2}$/.test(date.value) && !Number.isNaN(Date.parse(date.value)))
  )
    ctx.add(date.line, "meta date must be YYYY-MM-DD");
  const status = seen.get("status");
  if (status?.value && !["done", "partial"].includes(status.value))
    ctx.add(status.line, 'meta status must be "done" or "partial"');
}

function checkTests(entry, ctx) {
  if (!field(entry.text, "cmd")) ctx.add(entry.line, 'missing "cmd: <command>" field');
  const counts = COUNTS.exec(entry.text);
  if (!counts)
    ctx.add(entry.line, 'missing "<passed>/<total> passed, <skipped> skipped, <failed> failed"');
  const [passed, total, skipped, failed] = counts ? counts.slice(1).map(Number) : [];
  if (counts && passed + skipped + failed !== total)
    ctx.add(entry.line, `counts do not add up: ${passed}+${skipped}+${failed} != ${total}`);
  for (const problem of evidenceProblems(field(entry.text, "evidence"), ctx.root))
    ctx.add(entry.line, problem);
}

const ENTRY = {
  commits(entry, ctx) {
    const [sha, subject] = fields(entry.text);
    if (!sha || !subject) ctx.add(entry.line, 'commit entry must be "<sha> | <subject>"');
  },
  requirements(entry, ctx) {
    const state = fields(entry.text)[1];
    if (!STATES.has(state))
      ctx.add(entry.line, 'requirement must be "<ID> | done|partial|not-done | …"');
  },
  tests: checkTests,
  decisions(entry, ctx) {
    need(ctx, entry, "choice");
    need(ctx, entry, "rejected");
  },
  deviations(entry, ctx) {
    need(ctx, entry, "spec");
    need(ctx, entry, "actual");
  },
  open_issues(entry, ctx) {
    const severity = field(entry.text, "severity");
    if (!SEVERITIES.has(severity))
      ctx.add(entry.line, 'open issue needs "severity: blocker|major|minor"');
    need(ctx, entry, "target");
  },
  files(entry, ctx) {
    const [path, role] = fields(entry.text);
    if (!role) ctx.add(entry.line, 'file entry must be "<path> | <role>"');
    const problem = role?.startsWith("deleted") ? null : fileProblem(unquote(path ?? ""), ctx.root);
    if (problem) ctx.add(entry.line, `${problem} (role "deleted…" for removed files)`);
  },
  how_to_run(entry, ctx) {
    need(ctx, entry, "cmd");
  },
};

function checkSection(section, ctx) {
  const { name, line, entries } = section;
  if (entries.length === 0)
    return ctx.add(line, `empty section "## ${name}" must contain exactly "- none"`);
  const none = entries.find((entry) => entry.text === "none");
  if (none && entries.length > 1)
    ctx.add(none.line, `"- none" must be the only entry of "## ${name}"`);
  if (none && name === "meta") ctx.add(none.line, "meta cannot be empty");
  if (none) return;
  if (name === "meta") return checkMeta(entries, { ...ctx, metaLine: line });
  for (const entry of entries) {
    ENTRY[name]?.(entry, ctx);
    if (!EVIDENCE.has(name)) continue;
    const evidence = field(entry.text, "evidence");
    for (const problem of evidenceProblems(evidence, ctx.root)) ctx.add(entry.line, problem);
  }
}

function checkOrder(sections, add) {
  const seen = new Set();
  let last = -1;
  for (const { name, line } of sections) {
    const index = SECTIONS.indexOf(name);
    if (index < 0) add(line, `unknown section "## ${name}"`);
    else if (seen.has(name)) add(line, `duplicate section "## ${name}"`);
    else {
      if (index < last)
        add(line, `section "## ${name}" out of order (must come before "## ${SECTIONS[last]}")`);
      seen.add(name);
      last = Math.max(last, index);
    }
  }
  for (const name of SECTIONS) if (!seen.has(name)) add(0, `missing section "## ${name}"`);
}

/**
 * @param {string} text report contents
 * @param {{ file: string, root: string }} options repo-relative file name, repo root
 * @returns {string[]} one `<file>:<line>: <problem>` per problem (empty = pass)
 */
export function checkReport(text, { file, root }) {
  const problems = [];
  const add = (line, message) => problems.push({ line, message });
  const name = NAME.exec(file);
  if (!name) add(0, "file name must be docs/server/reports/info-<PHASE>[-<slug>].md");
  const report = parseReport(text);
  problems.push(...report.problems);
  const title = basename(file, ".md");
  if (report.title !== title) add(1, `line 1 must be the title "# ${title}"`);
  checkOrder(report.sections, add);
  const ctx = { add, root, phase: name?.[1] };
  for (const section of report.sections)
    if (SECTIONS.includes(section.name)) checkSection(section, ctx);
  for (const line of secretLines(text))
    add(line, "possible secret (an sk- key or an *_API_KEY=value); remove it");
  return problems
    .toSorted((a, b) => a.line - b.line)
    .map(({ line, message }) => (line ? `${file}:${line}: ${message}` : `${file}: ${message}`));
}
