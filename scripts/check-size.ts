/**
 * R10 (DEC-004): every hand-written source file stays at or under 250 lines. Generated files,
 * the lockfile and JSON (examples, configs) are excluded.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const LIMIT = 250;
const SOURCE = /\.(ts|tsx|js|mjs|cjs|css|html|py|sh)$|^\.githooks\//;
const GENERATED = [/(^|\/)dist\//, /^patches\//];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(
    (file) =>
      SOURCE.test(file) && !GENERATED.some((pattern) => pattern.test(file)) && existsSync(file),
  );

const oversized = files
  .map((file) => ({ file, lines: readFileSync(file, "utf8").split("\n").length - 1 }))
  .filter(({ lines }) => lines > LIMIT);

if (oversized.length > 0) {
  for (const { file, lines } of oversized)
    console.error(`${file}: ${lines} lines (limit ${LIMIT})`);
  process.exit(1);
}
console.log(`${files.length} source files within ${LIMIT} lines`);
