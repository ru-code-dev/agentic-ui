import type { PromptSectionId } from "@agentic-ui/ui-kit-one-catalog/prompt";

/** One color per prompt section, used by the stacked bar, the table and the prompt viewer. */
export const SECTION_COLORS: Readonly<Record<PromptSectionId, string>> = {
  instructions: "#a78bfa",
  "base-rules": "#60a5fa",
  envelope: "#22d3ee",
  "common-types": "#2dd4bf",
  "catalog-rules": "#fbbf24",
  components: "#7c8cff",
  functions: "#f472b6",
  defs: "#94a3b8",
  examples: "#34d399",
};

export const formatTokens = (value: number) => value.toLocaleString("en-US");

export const formatDelta = (value: number) =>
  value === 0 ? "±0" : `${value > 0 ? "+" : "−"}${formatTokens(Math.abs(value))}`;
