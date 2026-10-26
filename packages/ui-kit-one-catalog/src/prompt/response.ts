import {
  ExpressDecompiler,
  InMemoryCatalogProvider,
  type AgentToRendererMessage,
} from "@a2ui/agent";
import { CATALOG_ID } from "../catalog-id.ts";
import { PROTOCOL_VERSION } from "../catalog.ts";
import type { PromptFormat } from "./system-prompt.ts";

/**
 * What an agent writes to produce `messages` in `format`: a compact `<a2ui-json>` block for
 * Direct JSON, or an `<a2ui>` Express DSL block. Measures the output cost of a composition.
 */
export function responseText(
  catalogJson: Record<string, unknown>,
  messages: readonly unknown[],
  format: PromptFormat,
): string {
  if (format === "direct-json") return `<a2ui-json>${JSON.stringify(messages)}</a2ui-json>`;
  const catalog = new InMemoryCatalogProvider(catalogJson, PROTOCOL_VERSION, CATALOG_ID).load();
  const decompiler = new ExpressDecompiler([catalog], PROTOCOL_VERSION);
  return decompiler.wrapDecompiledBlocks([
    decompiler.decompile(messages as unknown as AgentToRendererMessage[]),
  ]);
}
