import type { MockRule } from "../state/workspace-store.ts";

export type RuleParse =
  | { readonly ok: true; readonly messages: readonly unknown[] }
  | { readonly ok: false; readonly error: string };

/** The reply messages of a rule, or why its JSON is not a message array. */
export function parseRule(rule: MockRule): RuleParse {
  try {
    const value: unknown = JSON.parse(rule.messages);
    return Array.isArray(value)
      ? { ok: true, messages: value }
      : { ok: false, error: "Reply must be a JSON array of messages" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Replies of the enabled rules matching an action event, in rule order. */
export function matchingReplies(
  rules: readonly MockRule[],
  event: string,
): Array<{ rule: MockRule; messages: readonly unknown[] }> {
  return rules.flatMap((rule) => {
    if (!rule.enabled || rule.event.trim() !== event) return [];
    const parsed = parseRule(rule);
    return parsed.ok ? [{ rule, messages: parsed.messages }] : [];
  });
}
