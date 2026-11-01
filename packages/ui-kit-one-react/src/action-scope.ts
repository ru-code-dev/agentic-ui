import { createContext, useContext } from "react";

/**
 * Lets a container observe event actions fired by components rendered inside it (Modal uses it
 * for `closeOnAction`). Components that fire actions call `useActionScope()` after dispatching.
 */
export const ActionScopeContext = createContext<() => void>(() => {});

export function useActionScope(): () => void {
  return useContext(ActionScopeContext);
}

/**
 * True inside a trigger (Modal `trigger`): a press there only opens its component locally, so
 * event actions are not dispatched to the agent (contract prop kind `trigger`, CF).
 */
export const TriggerScopeContext = createContext(false);

export function useInTrigger(): boolean {
  return useContext(TriggerScopeContext);
}
