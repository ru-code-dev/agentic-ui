import { buildCatalogJson, COMPONENT_APIS } from "@agentic-ui/ui-kit-one-catalog";
import {
  assembleSystemPrompt,
  responseText,
  type PromptFormat,
} from "@agentic-ui/ui-kit-one-catalog/prompt";
import { useDeferredValue, useMemo, useState } from "react";
import { parseMessages } from "../editor/parse-messages.ts";
import { compositions } from "../examples.ts";
import { useSession } from "../state/session-store.ts";
import { useWorkspace } from "../state/workspace-store.ts";
import { turnPayloads } from "./payloads.ts";
import type { TokenizerId } from "./tokenizers.ts";
import { useCounter } from "./use-counter.ts";

const CATALOG_JSON = buildCatalogJson();
const ALL_COMPONENTS = COMPONENT_APIS.map((api) => api.name);
const DEFAULT_EXAMPLES = 5;

export interface LlmControls {
  readonly components: readonly string[];
  readonly examples: number;
  readonly format: PromptFormat;
  readonly instructions: string;
}

export const DEFAULT_CONTROLS: LlmControls = {
  components: ALL_COMPONENTS,
  examples: DEFAULT_EXAMPLES,
  format: "direct-json",
  instructions: "",
};

const assemble = (controls: LlmControls) =>
  assembleSystemPrompt(CATALOG_JSON, {
    format: controls.format,
    examples: compositions.slice(0, controls.examples),
    ...(controls.components.length === ALL_COMPONENTS.length
      ? {}
      : { components: controls.components }),
    instructions: controls.instructions,
  });

/** State and measurements of the LLM context page (PG-26). */
export function useLlmContext() {
  const [controls, setControls] = useState<LlmControls>(DEFAULT_CONTROLS);
  const [tokenizer, setTokenizer] = useState<TokenizerId>("qwen");
  const [contextWindow, setContextWindow] = useState(128_000);
  const deferred = useDeferredValue(controls);
  const counter = useCounter(tokenizer);
  const source = useWorkspace((state) => state.source);
  const events = useSession((state) => state.events);
  const dataModels = useSession((state) => state.dataModels);

  const prompt = useMemo(() => assemble(deferred), [deferred]);
  const baseline = useMemo(() => assemble(DEFAULT_CONTROLS), []);

  const measured = useMemo(() => {
    if (counter === undefined) return undefined;
    const count = (text: string) => counter.count(text);
    const baselineSections = new Map(
      baseline.sections.map((section) => [section.id, count(section.text)]),
    );
    const sections = prompt.sections.map((section) => ({
      ...section,
      tokens: count(section.text),
      baseline: baselineSections.get(section.id) ?? 0,
    }));
    const components = Object.entries(prompt.catalog.components as Record<string, unknown>).map(
      ([name, entry]) => ({ name, tokens: count(JSON.stringify(entry)) }),
    );
    const outputs = compositions.map((composition) => ({
      id: composition.id,
      name: composition.name,
      tokens: count(responseText(CATALOG_JSON, composition.messages, deferred.format)),
    }));
    const parsed = parseMessages(source);
    const payloads = turnPayloads(
      parsed.ok ? parsed.messages : [],
      events.at(-1)?.kind === "action" ? events.at(-1) : undefined,
      dataModels,
      new Date().toISOString(),
    ).map((payload) => ({ label: payload.label, json: payload.json, tokens: count(payload.json) }));
    return {
      total: count(prompt.text),
      baselineTotal: count(baseline.text),
      sections,
      components,
      outputs,
      payloads,
    };
  }, [counter, prompt, baseline, deferred.format, source, events, dataModels]);

  return {
    controls,
    setControls,
    tokenizer,
    setTokenizer,
    contextWindow,
    setContextWindow,
    prompt,
    measured,
    loading: counter === undefined,
    allComponents: ALL_COMPONENTS,
  };
}
