/**
 * DEC-036: the component lists and example counts of the e2e specs come from the contract and its examples folder,
 * so adding a component or an example needs no spec edit.
 * CONTRACT_COMPONENTS = the built catalog.json (`pnpm build` runs before every e2e run), in contract order;
 * SNIPPET_COMPONENTS = the snippet files of packages/ui-kit-one-catalog/examples/components/ (one per component);
 * COMPOSITION_COUNT = the files of examples/compositions/.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const catalogPackage = new URL("../../../../packages/ui-kit-one-catalog/", import.meta.url);

export const CONTRACT_COMPONENTS: readonly string[] = Object.keys(
  (
    JSON.parse(readFileSync(new URL("dist/catalog.json", catalogPackage), "utf8")) as {
      components: Record<string, unknown>;
    }
  ).components,
);

const exampleNames = (group: string) =>
  readdirSync(fileURLToPath(new URL(`examples/${group}`, catalogPackage)))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .toSorted();

export const SNIPPET_COMPONENTS: readonly string[] = exampleNames("components");
export const COMPOSITION_COUNT: number = exampleNames("compositions").length;
