/**
 * A4b-R1: outside src/kit/ the renderer may import only its own files, react, @a2ui/*, @agentic-ui/*
 * and zod (agentic-ui/kit-boundary), so REMAP recipe 1's fork under any package name is still
 * blocked there. Lints a copy laid out like the renderer under WORKFLOW/tmp (SV-C18) with the repo
 * config and plugin.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
mkdirSync(join(root, "WORKFLOW", "tmp"), { recursive: true });
const dir = mkdtempSync(join(root, "WORKFLOW", "tmp", "kit-boundary-"));
after(() => rmSync(dir, { recursive: true, force: true }));
cpSync(join(root, ".oxlintrc.json"), join(dir, ".oxlintrc.json"));
cpSync(join(root, "scripts", "oxlint-plugin"), join(dir, "scripts", "oxlint-plugin"), {
  recursive: true,
});
const write = (path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const imports = [
  ["react", "useState"],
  ["react/jsx-runtime", "jsx"],
  ["@a2ui/web_core/v0_9", "MessageProcessor"],
  ["@agentic-ui/ui-kit-one-catalog", "CATALOG_ID"],
  ["zod", "z"],
  ["./button.tsx", "local"],
  ["@owner/chakra-fork", "Button"],
  ["@owner/react", "Fork"],
];
const source = `${imports.map(([from, name]) => `import { ${name} } from "${from}";`).join("\n")}\nexport const all = [${imports.map(([, name]) => name).join(", ")}];\n`;
write("packages/ui-kit-one-react/src/components/x.tsx", source);
write(
  "packages/ui-kit-one-react/src/kit/x.ts",
  'import { Button } from "@owner/chakra-fork";\nexport const B = Button;\n',
);

function lint(file) {
  const vp = join(root, "node_modules", ".bin", "vp");
  let out;
  try {
    out = execFileSync(vp, ["lint", "-c", ".oxlintrc.json", "--format", "json", file], {
      cwd: dir,
      encoding: "utf8",
    });
  } catch (error) {
    out = error.stdout;
  }
  return JSON.parse(out)
    .diagnostics.filter((d) => d.code === "agentic-ui(kit-boundary)")
    .map((d) => d.message.split("`")[1]);
}

test("[A4b-R1] a kit fork under any package name fails outside src/kit/; allowed packages and own files pass", () => {
  assert.deepEqual(lint("packages/ui-kit-one-react/src/components/x.tsx").toSorted(), [
    "@owner/chakra-fork",
    "@owner/react",
  ]);
  assert.deepEqual(lint("packages/ui-kit-one-react/src/kit/x.ts"), [], "src/kit/ imports the kit");
});
