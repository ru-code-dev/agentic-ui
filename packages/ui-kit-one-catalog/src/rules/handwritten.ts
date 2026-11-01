/**
 * The only hand-written catalog rules. They must not name a component, prop, token or function of
 * the contract (tests/catalog-rules.test.ts); everything specific is generated (catalog-rules.ts,
 * interactions.ts).
 */
export const HANDWRITTEN_RULES: readonly string[] = [
  "- Use only the components, props and token values of this catalog. No free-form styling: no sx, CSS, pixel values or responsive objects.",
  "- Plan before writing: choose every component id first, emit the root first and each parent before its children, define every id you reference and reuse the exact id string (no renamed or missing ids).",
  '- Keep varying data (lists, table rows, form values, amounts, statuses) in the data model: one updateDataModel message with the whole data object under its value key; bind content to it with {"path": "/..."}.',
  "- A function call has exactly two keys, call and args: omit returnType.",
  "- Never compute styling from data: no conditions, comparisons or ternaries anywhere; every value is a literal, a binding or a function call.",
  "- Never ask the user questions and never wait for an answer: make reasonable assumptions about anything missing or unclear and always reply with the complete UI.",
  "- Surfaces stay on the page for the whole chat (SV-C26): when the user refines a shown surface or acts on it, update that surface (same surfaceId, no new createSurface); create a new surface with a new surfaceId only for a new topic.",
];
