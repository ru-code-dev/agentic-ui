import type { ComponentApi } from "@a2ui/web_core/v0_9";
import type { z } from "zod";
import { propDoc, type PropDoc } from "./docs/prop-docs.ts";
import { propMeta } from "./prop-kinds.ts";

const fields = (docs: readonly PropDoc[], owner: string): Array<[string, PropDoc]> =>
  docs.flatMap((d) => [
    [`${owner}.${d.name}`, d],
    ...fields(d.items ?? [], `${owner}.${d.name}[]`),
  ]);

/**
 * What keeps a component from being complete (SV-C22): a missing component description, a prop
 * without a kind, or a prop / item field without a description. Empty for a complete contract.
 */
export function contractProblems(apis: readonly ComponentApi[]): string[] {
  const problems: string[] = [];
  for (const api of apis) {
    if ((api.schema.description ?? "").trim() === "") problems.push(`${api.name}: no description`);
    const shape = (api.schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
    for (const [name, schema] of Object.entries(shape))
      if (propMeta(schema) === undefined) problems.push(`${api.name}.${name}: no prop kind`);
    const docs = Object.entries(shape).map(([name, schema]) => propDoc(name, schema));
    for (const [label, doc] of fields(docs, api.name))
      if (doc.description.trim() === "") problems.push(`${label}: no description`);
  }
  return problems;
}

/** Throws when any component is half-described, so no catalog, prompt or docs can be built. */
export function assertCompleteContract(apis: readonly ComponentApi[]): void {
  const problems = contractProblems(apis);
  if (problems.length > 0)
    throw new Error(`Incomplete contract (prop-kinds.ts, .describe()):\n${problems.join("\n")}`);
}
