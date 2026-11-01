import { catalogRules } from "./catalog-rules.ts";
import { HANDWRITTEN_RULES } from "./handwritten.ts";
import { interactionRules } from "./interactions.ts";
import type { ContractSource } from "./source.ts";

export { catalogRules } from "./catalog-rules.ts";
export { HANDWRITTEN_RULES } from "./handwritten.ts";
export { interactionRules } from "./interactions.ts";
export type { ContractSource } from "./source.ts";

/** The catalog `instructions`: hand-written base rules, generated rules, then Interactions. */
export function buildInstructions(source: ContractSource): string {
  return [
    "ui-kit-one rules:",
    ...HANDWRITTEN_RULES,
    ...catalogRules(source),
    "",
    "Interactions:",
    ...interactionRules(source),
  ].join("\n");
}
