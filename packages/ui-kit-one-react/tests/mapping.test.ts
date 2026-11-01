import { COMPONENT_APIS, STYLE_PROP_NAMES, iconNames } from "@agentic-ui/ui-kit-one-catalog";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import type { z } from "zod";
import { renderMappingMarkdown } from "../scripts/mapping-markdown.ts";
import {
  COMPONENT_IMPLEMENTATIONS,
  COMPONENT_MAPPINGS,
  ICON_KIT_NAMES,
  PASSTHROUGH,
  uiKitOneCatalog,
} from "../src/index.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
/** `RadioGroup` → `radio-group.tsx`: the file of a custom component in src/components/. */
const fileOf = (name: string) =>
  `${name.replace(/(?<=\p{Ll})(?=\p{Lu})/gu, "-").toLowerCase()}.tsx`;
const shapeOf = (schema: z.ZodTypeAny) => Object.keys((schema as z.AnyZodObject).shape as object);

describe("contract → kit mapping [INT-04, DOC-04]", () => {
  it("implements every contract component, in contract order", () => {
    expect(COMPONENT_IMPLEMENTATIONS.map((impl) => impl.name)).toEqual(
      COMPONENT_APIS.map((api) => api.name),
    );
    expect([...uiKitOneCatalog.components.keys()]).toEqual(COMPONENT_APIS.map((api) => api.name));
    expect(uiKitOneCatalog.functions.size).toBe(14);
  });

  it("maps every contract prop of every component, and nothing else", () => {
    for (const api of COMPONENT_APIS) {
      const mapping = COMPONENT_MAPPINGS.find((candidate) => candidate.component === api.name);
      expect(mapping, api.name).toBeDefined();
      expect(Object.keys(mapping?.props ?? {}), api.name).toEqual(shapeOf(api.schema));
    }
  });

  it("passes every component without a custom file through the generic factory (DEC-005) [DEC-036, A3-27]", () => {
    // A custom component has its own file in src/components/; every other component is a passthrough line.
    // Lookup is by name: the order of the passthrough lines is free (REMAP recipe 7 appends one).
    const custom = new Set(readdirSync(join(packageRoot, "src/components")));
    const pure = COMPONENT_APIS.map((api) => api.name).filter((name) => !custom.has(fileOf(name)));
    expect(Object.keys(PASSTHROUGH).toSorted()).toEqual(pure.toSorted());
    expect(pure.length).toBeGreaterThan(0);
  });

  it("declares by hand only the props that are translated; the rest are identity", () => {
    const identity = (component: string) =>
      Object.entries(COMPONENT_MAPPINGS.find((m) => m.component === component)?.props ?? {})
        .filter(([, prop]) => prop.identity === true)
        .map(([name]) => name);
    expect(identity("Text")).toEqual(["color", "fontSize", "fontWeight", "textAlign", "noOfLines"]);
    expect(identity("Button")).toEqual([
      "variant",
      "colorScheme",
      "size",
      "isLoading",
      "isFullWidth",
    ]);
    expect(STYLE_PROP_NAMES.every((name) => identity("Box").includes(name))).toBe(true);
  });

  it("maps every contract icon to a kit icon", () => {
    expect(Object.keys(ICON_KIT_NAMES).toSorted()).toEqual([...iconNames].toSorted());
  });

  it("keeps MAPPING.md generated from the mappings (regenerate with `pnpm build`) [D2-10]", () => {
    const committed = readFileSync(join(packageRoot, "MAPPING.md"), "utf8");
    expect(committed).toBe(
      renderMappingMarkdown(
        COMPONENT_MAPPINGS,
        Object.keys(PASSTHROUGH),
        ICON_KIT_NAMES,
        STYLE_PROP_NAMES,
      ),
    );
  });

  it("imports the UI kit only inside src/kit/", () => {
    const root = join(packageRoot, "src");
    const offenders = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !file.startsWith("kit/"))
      .filter((file) =>
        /from\s+["'](@chakra-ui\/|@emotion\/|framer-motion)/.test(
          readFileSync(join(root, file), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
