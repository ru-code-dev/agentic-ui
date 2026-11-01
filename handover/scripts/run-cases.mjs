/**
 * SV-C28 / SV-C23: runs the bundle-only validator (bundle-validator.mjs) on every chat of validator-cases/cases.json,
 * step by step from an empty state, and compares each step's verdict with `expected.valid`.
 * Usage (from the bundle folder, with ajv@8 + ajv-formats@3 installed next to it or in a parent folder):
 *   node scripts/run-cases.mjs [<bundle dir>] [<a file whose folder resolves ajv>]
 * Prints `cases N, steps M, disagreements K` (+ the first disagreements) and exits 1 on any disagreement.
 * `runCases(dir, require)` → { cases, steps, wrong: [{ id, step, expected, problems }], rules: Set of rule ids seen }.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { bundleValidator } from "./bundle-validator.mjs";

export function runCases(dir, require) {
  const validator = bundleValidator(dir, require);
  const { cases } = JSON.parse(readFileSync(join(dir, "validator-cases/cases.json"), "utf8"));
  const wrong = [];
  const rules = new Set();
  let steps = 0;
  for (const { id, steps: chat } of cases) {
    const session = validator.chat();
    chat.forEach(({ messages, expected }, step) => {
      const problems = session.check(messages);
      steps++;
      for (const p of problems) rules.add(p.rule);
      if ((problems.length === 0) !== expected.valid) wrong.push({ id, step, expected: expected.valid, problems });
    });
  }
  return { cases: cases.length, steps, wrong, rules };
}

if (resolve(argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const dir = resolve(argv[2] ?? join(fileURLToPath(new URL(".", import.meta.url)), ".."));
  const result = runCases(dir, createRequire(resolve(argv[3] ?? join(process.cwd(), "package.json"))));
  console.log(`cases ${result.cases}, steps ${result.steps}, disagreements ${result.wrong.length}`);
  for (const w of result.wrong.slice(0, 10)) console.log(JSON.stringify(w).slice(0, 400));
  process.exitCode = result.wrong.length > 0 ? 1 : 0;
}
