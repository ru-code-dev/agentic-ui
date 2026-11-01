/**
 * CF-I3 / DEC-034: the agent server's bundled data is generated from the contract, never hand-edited.
 * `serverData()` = package-relative path → fresh text of every file in src/agentic_ui_server/data/:
 * catalog.json and system-prompt.md exactly as the catalog package builds them (scripts/artifacts.ts),
 * plus the A2UI v0.9 envelope schemas the Python validator resolves offline (RESEARCH §F.3), taken from
 * the installed @a2ui/web_core like the catalog's own validator (scripts/spec-schemas.ts), and DEC-056's
 * contract-version.json: the version every HTTP answer carries (`contractVersion`), computed like the page's and
 * handover/manifest.json's (packages/ui-kit-one-catalog/scripts/contract-version.ts).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import {
  catalogJsonText,
  systemPromptText,
} from "../../../packages/ui-kit-one-catalog/scripts/artifacts.ts";
import { contractVersionOf } from "../../../packages/ui-kit-one-catalog/scripts/contract-version.ts";
import { readSpecSchema } from "../../../packages/ui-kit-one-catalog/scripts/spec-schemas.ts";

export const DATA_DIR = "src/agentic_ui_server/data";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function serverData() {
  const catalog = catalogJsonText();
  return {
    [`${DATA_DIR}/catalog.json`]: catalog,
    [`${DATA_DIR}/contract-version.json`]: json({ contractVersion: contractVersionOf(catalog) }),
    [`${DATA_DIR}/system-prompt.md`]: systemPromptText().text,
    [`${DATA_DIR}/common_types.json`]: json(readSpecSchema("common_types.json")),
    [`${DATA_DIR}/server_to_client.json`]: json(readSpecSchema("server_to_client.json")),
  };
}

/** Entries of `dir` (on disk or in the git index) whose name is not in `expected`: foreign files in a generated folder. */
export function foreignFiles(dir, expected) {
  if (!existsSync(dir)) return [];
  const names = new Set(
    readdirSync(dir, { withFileTypes: true }).map((entry) =>
      entry.isDirectory() ? `${entry.name}/` : entry.name,
    ),
  );
  const indexed = execFileSync("git", ["ls-files", "--", "."], { cwd: dir, encoding: "utf8" });
  for (const path of indexed.split("\n").filter(Boolean))
    names.add(path.includes("/") ? `${path.split("/")[0]}/` : path);
  return [...names].filter((name) => !expected.includes(name)).toSorted();
}
