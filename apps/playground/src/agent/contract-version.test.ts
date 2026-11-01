import { describe, expect, it } from "vite-plus/test";
import { sourceContractVersion } from "../../../../packages/ui-kit-one-catalog/scripts/contract-version.ts";
import { CONTRACT_VERSION } from "@agentic-ui/a2ui-react/core";

// The page embeds the version of the contract source (vite.config.ts, A4-A02): the version of the
// dist/catalog.json `pnpm build` writes. A6-05: no dist/ needed, so a fresh clone's `pnpm check`
// (unit tests before build) passes. The title is kept: docs/server/reports/info-A3F-web.md cites it.
describe("the page's contract version (DEC-056) [DEC-056, A6-05]", () => {
  it("is the built contract's version, embedded at build time", () => {
    expect(CONTRACT_VERSION).toMatch(/^urn:agentic-ui:catalog:ui-kit-one:v1 sha256:[0-9a-f]{12}$/);
    expect(CONTRACT_VERSION).toBe(sourceContractVersion());
  });
});
