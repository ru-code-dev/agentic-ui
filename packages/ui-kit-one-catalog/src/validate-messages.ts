import { validatePayload } from "@a2ui/agent";
import { uiKitOneContract } from "./catalog.ts";

export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly message: string };

/**
 * Validates A2UI messages against the ui-kit-one catalog with the agent SDK's validator (one reply on its own;
 * the merged chat state is `createChatSurfaces`, SV-C28). Shared by the playground editor and the PKG package.
 */
export function validateMessages(messages: readonly unknown[]): ValidationResult {
  try {
    validatePayload([uiKitOneContract], messages);
    return { valid: true };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : String(error) };
  }
}
