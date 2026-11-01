/**
 * DEC-050 public API proof: replacing `export *` / `export * as tokens` by explicit named exports
 * keeps every name. BEFORE_* are the runtime export names captured before the change; the only
 * difference allowed is the `tokens` namespace, whose members are now exported by name. The type
 * imports below fail to compile if a type export disappears.
 */
import { describe, expect, it } from "vite-plus/test";
import type {
  ColorScheme,
  ColorToken,
  ContractSource,
  IconName,
  PropKind,
  PropMeta,
  PropView,
  StyleGroup,
} from "../src/index.ts";

/** The module object, via dynamic import (no `import * as`, DEC-050). */
const entry = await import("../src/index.ts");
const tokenFiles = await import("../src/tokens/index.ts");

export type PublicTypes = [
  ColorScheme,
  ColorToken,
  ContractSource,
  IconName,
  PropKind,
  PropMeta,
  PropView,
  StyleGroup,
];

/** Runtime names of `src/index.ts` before DEC-050 (`tokens` was a namespace). */
const BEFORE_ENTRY = [
  "AvatarApi",
  "BoxApi",
  "ButtonApi",
  "CATALOG_ID",
  "CATALOG_INSTRUCTIONS",
  "CATALOG_OPTIONS",
  "COMPONENT_APIS",
  "COMPONENT_ROLES",
  "CONTRACT_SOURCE",
  "CenterApi",
  "CheckboxApi",
  "ContainerApi",
  "FUNCTION_APIS",
  "FUNCTION_USES",
  "FlexApi",
  "GridApi",
  "HeadingApi",
  "IconApi",
  "IconNameSchema",
  "InputApi",
  "ListApi",
  "ModalApi",
  "PROP_KINDS",
  "PROTOCOL_VERSION",
  "RadioGroupApi",
  "STYLE_GROUPS",
  "STYLE_NOTE",
  "STYLE_PROP_NAMES",
  "SwitchApi",
  "TWO_WAY_BINDINGS",
  "TableApi",
  "TabsApi",
  "TagApi",
  "TextApi",
  "assertCompleteContract",
  "buildCatalogJson",
  "buildInstructions",
  "componentProps",
  "contractProblems",
  "createContract",
  "iconNames",
  "pickTokens",
  "propMeta",
  "propsOfKind",
  "tokens",
  "twoWayBindings",
  "uiKitOneContract",
];

/** Runtime names of `src/tokens/index.ts` (and of the old `tokens` namespace) before DEC-050. */
const BEFORE_TOKENS = [
  "alphaPalettes",
  "avatarSizeTokens",
  "baseColors",
  "borderWidthTokens",
  "borderWidths",
  "boxSizes",
  "buttonVariants",
  "colorSchemes",
  "colorTokens",
  "controlSizes",
  "directions",
  "flexAligns",
  "flexJustifies",
  "flexWraps",
  "fontSizeTokens",
  "fontSizes",
  "fontWeightTokens",
  "fontWeights",
  "formatting",
  "headingElements",
  "headingSizes",
  "iconSizeTokens",
  "inputTypes",
  "listVariants",
  "maxGridColumns",
  "modalSizes",
  "palettes",
  "radii",
  "radiusTokens",
  "shadowTokens",
  "shadows",
  "sizeTokens",
  "sizes",
  "space",
  "spaceTokens",
  "tableColumnFormats",
  "tableVariants",
  "tabsVariants",
  "tagVariants",
  "textAligns",
];

/** Names added since (each listed on purpose: an accidental export would join the hand-over API). */
// A4F: SV-C28 merged surface state; PKG: validateMessages moved here from the playground (one implementation).
const ADDED = ["createChatSurfaces", "surfaceSnapshot", "validateMessages"];

describe("public API [DEC-050] (named exports only)", () => {
  it("the package entry exports the same names, with the tokens namespace members by name", () => {
    const expected = [
      ...BEFORE_ENTRY.filter((name) => name !== "tokens"),
      ...BEFORE_TOKENS,
      ...ADDED,
    ];
    expect(Object.keys(entry).toSorted()).toEqual(expected.toSorted());
  });

  it("the tokens barrel exports the same names", () => {
    expect(Object.keys(tokenFiles).toSorted()).toEqual(BEFORE_TOKENS);
  });
});
