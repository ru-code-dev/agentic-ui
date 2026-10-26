import { buildCatalogJson } from "@agentic-ui/ui-kit-one-catalog";

const contract = import.meta.glob<string>(
  "../../../../packages/ui-kit-one-catalog/src/components/*.ts",
  { query: "?raw", import: "default", eager: true },
);
const renderer = import.meta.glob<string>(
  "../../../../packages/ui-kit-one-react/src/components/*.tsx",
  { query: "?raw", import: "default", eager: true },
);
const passthrough = import.meta.glob<string>(
  [
    "../../../../packages/ui-kit-one-react/src/passthrough-components.ts",
    "../../../../packages/ui-kit-one-react/src/passthrough.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
);

const kebab = (name: string) => name.replaceAll(/(?<!^)([A-Z])/g, "-$1").toLowerCase();
const find = (files: Record<string, string>, suffix: string) =>
  Object.entries(files).find(([path]) => path.endsWith(suffix))?.[1];
const CATALOG = buildCatalogJson() as { components: Record<string, unknown> };

/** Zod source of a contract component (`packages/ui-kit-one-catalog/src/components/<name>.ts`). */
export const contractSource = (name: string) => find(contract, `/${kebab(name)}.ts`) ?? "";

/** Renderer source: the component file, or the passthrough registry line plus the generic factory. */
export function rendererSource(name: string): { code: string; file: string } {
  const custom = find(renderer, `/${kebab(name)}.tsx`);
  if (custom !== undefined)
    return { code: custom, file: `ui-kit-one-react/src/components/${kebab(name)}.tsx` };
  const registry = find(passthrough, "/passthrough-components.ts") ?? "";
  const line =
    registry.split("\n").find((text) => text.trimStart().startsWith(`${name}: passthrough(`)) ?? "";
  const factory = find(passthrough, "/passthrough.tsx") ?? "";
  return {
    code: `// src/passthrough-components.ts — ${name} is pure kit data (DEC-005)\n${line.trim()}\n\n// src/passthrough.tsx\n${factory}`,
    file: "ui-kit-one-react/src/passthrough-components.ts",
  };
}

/** The component's entry of the generated catalog.json. */
export const schemaEntry = (name: string) => JSON.stringify(CATALOG.components[name], null, 2);
