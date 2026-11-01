/**
 * Few-shot examples of the default system prompt, in order (composition file ids). The first five
 * are the examples of the measured baseline (EXPERIMENT §4/§12); 21-24 teach the patterns the
 * real model got wrong (EXPERIMENT §9): status colours on explicit rows, one ChildList template
 * object, a Modal opened by a Button, per-item state in a template. Shared by build-prompt.ts,
 * the playground prompt views and the experiment harness.
 */
export const PROMPT_EXAMPLE_IDS = [
  "01-login",
  "02-signup",
  "03-settings",
  "04-user-list",
  "05-data-table",
  "21-order-statuses",
  "22-payment-history",
  "23-transfer-confirm-modal",
  "24-task-checklist",
] as const;

/** `examples` with the prompt examples first (in prompt order), then the rest in their order. */
export function orderForPrompt<T>(examples: readonly T[], idOf: (example: T) => string): T[] {
  const rank = (example: T) => {
    const index = (PROMPT_EXAMPLE_IDS as readonly string[]).indexOf(idOf(example));
    return index === -1 ? PROMPT_EXAMPLE_IDS.length : index;
  };
  return examples
    .map((example, order) => ({ example, order }))
    .toSorted((a, b) => rank(a.example) - rank(b.example) || a.order - b.order)
    .map(({ example }) => example);
}
