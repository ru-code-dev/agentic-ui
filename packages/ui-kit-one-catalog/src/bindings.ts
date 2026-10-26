/**
 * Two-way bindings of the contract: props a renderer writes back to their bound data-model path
 * when the user changes them. Every other dynamic prop is read-only for the renderer.
 */
export const TWO_WAY_BINDINGS: Readonly<Record<string, readonly string[]>> = {
  Input: ["value"],
  Checkbox: ["value"],
  RadioGroup: ["value"],
  Switch: ["value"],
  Modal: ["open"],
  Tabs: ["selectedIndex"],
};
