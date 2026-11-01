import { list, view, type ContractSource } from "./source.ts";

const label = (p: { component: string; name: string }) => `${p.component}.${p.name}`;

/**
 * The Interactions section (SV-C22): what the renderer does locally and what reaches the agent,
 * generated from the two-way, trigger, checks and action prop kinds.
 */
export function interactionRules(source: ContractSource): string[] {
  const v = view(source);
  const twoWay = v.where((p) => p.kind === "two-way");
  const triggers = v.where((p) => p.kind === "trigger");
  const actions = v.where((p) => p.kind === "action");
  const required = actions.filter((p) => p.required);
  const triggered = v.unique(triggers.map((p) => p.component));
  return [
    `- Two-way props (${list(twoWay.map(label))}): the renderer writes the user's change to the bound path locally, without an agent turn. Always bind them to their own data-model path, never a literal.`,
    `- Triggers (${list(triggers.map(label))}) open their ${list(triggered)} locally; the trigger's own event action is not sent to the agent.`,
    `- Checks (${list(v.components((p) => p.kind === "checks"))}) are evaluated locally whenever the data changes.`,
    `- ${list(actions.map(label))} with {"event": {"name": "...", "context": {...}}} is sent to the agent with its resolved context, plus the whole data model when createSurface has sendDataModel: true. Set it whenever the surface has two-way props (${list(v.unique(twoWay.map((p) => p.component)))}). Answer an event with updateDataModel for changed data (keep it small) or updateComponents for a new layout.`,
    `- ${list(actions.map(label))} with {"functionCall": {"call": "...", "args": {...}}} runs locally, without an agent turn (e.g. ${list(v.returning("void"))}).`,
    `- ${list(required.map(label))} is required, also on a trigger: give it an event such as {"event": {"name": "modal.open"}}.`,
  ];
}
