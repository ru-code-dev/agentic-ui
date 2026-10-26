import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The A2UI v0.9 envelope schemas shipped inside `@a2ui/web_core` (semantically identical to
 * `specification/v0_9/json`), so validation always matches the installed protocol library.
 */
const schemasDir = new URL("./schemas/", import.meta.resolve("@a2ui/web_core/v0_9"));

export function readSpecSchema(
  file: "common_types.json" | "server_to_client.json",
): Record<string, unknown> {
  return JSON.parse(readFileSync(fileURLToPath(new URL(file, schemasDir)), "utf8")) as Record<
    string,
    unknown
  >;
}

/** `server_to_client.json` refers to the active catalog as `catalog.json` next to itself. */
export const SPEC_CATALOG_ALIAS = "https://a2ui.org/specification/v0_9/catalog.json";
