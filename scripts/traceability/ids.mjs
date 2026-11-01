/**
 * DEC-032: the hand-maintained ID list docs/TRACEABILITY.ids.json.
 *
 * `phases`: phase → "done" | "open" | "out" (each phase gate flips its phase to done; "out" = the phase was
 *          dropped by a decision, DEC-051: it may hold only out-of-scope IDs).
 * `ids[]`: `{ id, source, title, scope: "in", phase, checks?, covers?, gap? }` or
 *          `{ id, source, title, scope: "out", reason, evidence }` (evidence cites a DEC-nnn of
 *          docs/DECISIONS.md). `source` starts with INTENT | SPEC | PLAN | DECISIONS (an optional
 *          section may follow, e.g. "SPEC §13"); bare INTENT/SPEC/DECISIONS IDs must exist there.
 *          `checks` names root scripts of the `pnpm check` pipeline that prove the ID besides
 *          tagged tests. `covers` (IDs, ranges allowed: "PG-01..18") makes an umbrella ID proven
 *          when every in-scope ID it covers is proven. `gap` records a done phase that shipped the ID without proof: the ID is
 *          moved to an open `phase` that must prove it (listed as an open issue in the report).
 */

// A review round may suffix its prefix with one lowercase letter (A4b-P1, DEC-062).
export const ID = /^[A-Z][A-Z0-9]*[a-z]?-[A-Za-z0-9.-]+$/;
const SOURCE = /^(?:INTENT|SPEC|PLAN|DECISIONS)(?: \S.*)?$/;
const PHASE_STATES = new Set(["done", "open", "out"]);
const DEC = /\bDEC-\d{3}\b/g;

function decisionIds(decisionsText) {
  const ids = new Set();
  for (const line of decisionsText.split("\n")) {
    const match = /^([A-Z][A-Z0-9]*[a-z]?-[A-Za-z0-9.-]+) \|/.exec(line);
    if (match) ids.add(match[1]);
  }
  return ids;
}

/** Root scripts that `pnpm check` runs (`vp run -w <name>` / `pnpm run <name>` / `pnpm <name>`). */
export function pipelineScripts(packageJson) {
  const check = packageJson.scripts?.check ?? "";
  return new Set(
    Object.keys(packageJson.scripts ?? {}).filter((name) =>
      new RegExp(`(?:-w|run|pnpm)\\s+${name.replaceAll(/[.:]/g, "\\$&")}(?=\\s|$|&)`).test(check),
    ),
  );
}

function entryProblems(entry, at, { phases, decisions, pipeline }) {
  const problems = [];
  const need = (field) => {
    if (typeof entry[field] !== "string" || entry[field].trim() === "")
      problems.push(`${at}: missing "${field}"`);
  };
  if (!ID.test(entry.id ?? "")) problems.push(`${at}: id "${entry.id}" is not an ID`);
  if (!SOURCE.test(entry.source ?? ""))
    problems.push(
      `${at}: source "${entry.source}" must start with INTENT, SPEC, PLAN or DECISIONS`,
    );
  need("title");
  if (entry.scope === "in") {
    if (!Object.hasOwn(phases, entry.phase ?? ""))
      problems.push(`${at}: phase "${entry.phase}" is not listed in "phases"`);
    else if (phases[entry.phase] === "out")
      problems.push(`${at}: phase ${entry.phase} is out (dropped): its IDs must be out of scope`);
    if (
      entry.gap !== undefined &&
      (typeof entry.gap !== "string" || phases[entry.phase] !== "open")
    )
      problems.push(`${at}: "gap" must be a text and its phase must be open`);
    if (entry.covers !== undefined && (!Array.isArray(entry.covers) || entry.covers.length === 0))
      problems.push(`${at}: "covers" must be a non-empty ID list`);
    for (const check of entry.checks ?? [])
      if (!pipeline.has(check))
        problems.push(`${at}: check "${check}" is not a root script run by pnpm check`);
  } else if (entry.scope === "out") {
    need("reason");
    need("evidence");
    const cited = String(entry.evidence ?? "").match(DEC) ?? [];
    if (cited.length === 0) problems.push(`${at}: out-of-scope evidence must cite a DEC-nnn`);
    for (const dec of cited)
      if (!decisions.has(dec)) problems.push(`${at}: ${dec} not found in docs/DECISIONS.md`);
  } else {
    problems.push(`${at}: scope "${entry.scope}" must be "in" or "out"`);
  }
  return problems;
}

/**
 * Parses and validates the ids file. `context` = `{ decisionsText, packageJson, sources }` where
 * `sources` are the IDs parsed from INTENT/SPEC (sources.mjs). Returns `{ phases, ids, problems }`.
 */
export function loadIds(text, file, { decisionsText, packageJson, sources }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { phases: {}, ids: [], problems: [`${file}: invalid JSON (${error.message})`] };
  }
  const phases = data.phases ?? {};
  const ids = Array.isArray(data.ids) ? data.ids : [];
  const problems = [];
  if (!Array.isArray(data.ids)) problems.push(`${file}: "ids" must be an array`);
  for (const [phase, state] of Object.entries(phases))
    if (!PHASE_STATES.has(state))
      problems.push(`${file}: phase ${phase} state "${state}" must be "done", "open" or "out"`);
  const context = {
    phases,
    decisions: decisionIds(decisionsText),
    pipeline: pipelineScripts(packageJson),
  };
  const seen = new Set();
  for (const entry of ids) {
    const at = `${file}: ${entry.id ?? "?"}`;
    if (seen.has(entry.id)) problems.push(`${at}: duplicate id`);
    seen.add(entry.id);
    problems.push(...entryProblems(entry, at, context));
  }
  const documented = new Map(sources.map((source) => [source.id, source]));
  for (const source of sources)
    if (!seen.has(source.id))
      problems.push(`${file}: ${source.source} ID ${source.id} is not classified (add it)`);
  for (const entry of ids) {
    if ((entry.source === "INTENT" || entry.source === "SPEC") && !documented.has(entry.id))
      problems.push(`${file}: ${entry.id} is not an ID of ${entry.source} (removed or renamed?)`);
    if (entry.source === "DECISIONS" && !context.decisions.has(entry.id))
      problems.push(`${file}: ${entry.id} is not a decision of docs/DECISIONS.md`);
  }
  return { phases, ids, problems };
}
