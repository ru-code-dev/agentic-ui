/**
 * DEC-056: the contract version, `<catalogId> sha256:<first 12 hex of sha256(catalog.json)>`. The
 * same value as handover/manifest.json `contractVersion` and the server's `contractVersion` (its
 * bundled data/catalog.json is this package's dist/catalog.json); the playground build embeds it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { catalogJsonText } from "./artifacts.ts";

/** The contract version of a catalog.json text. */
export function contractVersionOf(catalogJsonText: string): string {
  const { catalogId } = JSON.parse(catalogJsonText) as { catalogId: string };
  const hash = createHash("sha256").update(catalogJsonText, "utf8").digest("hex");
  return `${catalogId} sha256:${hash.slice(0, 12)}`;
}

/** The contract version of the built dist/catalog.json (what `pnpm build` ships). */
export const builtContractVersion = (): string =>
  contractVersionOf(readFileSync(new URL("../dist/catalog.json", import.meta.url), "utf8"));

/**
 * A4-A02: the contract version of the catalog source, i.e. of the dist/catalog.json text `pnpm build`
 * writes from it. The playground config uses it, so `pnpm dev` and `pnpm dev:agent-mode` work on a
 * fresh clone that has no dist/ yet (a build with a stale dist already fails, PG-30).
 */
export const sourceContractVersion = (): string => contractVersionOf(catalogJsonText());
