/**
 * The kit boundary: the only folder that imports the UI kit (Chakra UI v1, its icons and its
 * Emotion runtime) — lint-enforced. Swapping the kit for a fork means changing these files.
 *
 * Components are re-exported through narrow facades (one file per kit component) that list
 * exactly the props the renderer uses. That list is the kit surface a fork must provide — and it
 * keeps TypeScript (>= 5.0) away from Chakra v1's polymorphic `as` typings, which fail with TS2590
 * ("union type too complex") on direct JSX use. Each facade is a checked assignment, never a cast.
 */
export * from "./avatar.ts";
export * from "./box.ts";
export * from "./button.ts";
export * from "./center.ts";
export * from "./checkbox.ts";
export * from "./container.ts";
export * from "./flex.ts";
export * from "./form-control.ts";
export * from "./heading.ts";
export * from "./icons.ts";
export * from "./input.ts";
export * from "./list.ts";
export * from "./modal.ts";
export * from "./providers.ts";
export * from "./radio.ts";
export * from "./scoped-reset.ts";
export * from "./simple-grid.ts";
export * from "./stack.ts";
export * from "./switch.ts";
export * from "./table.ts";
export * from "./tabs.ts";
export * from "./tag.ts";
export * from "./text.ts";
export * from "./theme.ts";
export * from "./types.ts";
