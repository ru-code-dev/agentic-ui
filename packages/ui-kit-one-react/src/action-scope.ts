import { createContext, useContext } from "react";

/**
 * Lets a container observe event actions fired by components rendered inside it (Modal uses it
 * for `closeOnAction`). Components that fire actions call `useActionScope()` after dispatching.
 */
export const ActionScopeContext = createContext<() => void>(() => {});

export function useActionScope(): () => void {
  return useContext(ActionScopeContext);
}
