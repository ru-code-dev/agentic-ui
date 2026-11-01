/**
 * Design tokens and component options of ui-kit-one — the one folder to edit when the kit's
 * values change. Every enum in the component schemas is derived from these files.
 *
 * Values are literal copies of the Chakra UI v1 default theme (`@chakra-ui/theme@1.14.1`), never
 * imported at runtime; each group names its source file. Keys are the values agents write in
 * A2UI JSON (e.g. `"p": "4"`, `"bg": "gray.700"`); values document what they resolve to.
 */
export { borderWidthTokens, borderWidths } from "./borders.ts";
export { avatarSizeTokens, boxSizes, iconSizeTokens } from "./box-sizes.ts";
export {
  alphaPalettes,
  baseColors,
  colorSchemes,
  colorTokens,
  palettes,
  type ColorScheme,
  type ColorToken,
} from "./colors.ts";
export {
  buttonVariants,
  controlSizes,
  directions,
  flexAligns,
  flexJustifies,
  flexWraps,
  headingElements,
  headingSizes,
  inputTypes,
  listVariants,
  maxGridColumns,
  modalSizes,
  tableColumnFormats,
  tableVariants,
  tabsVariants,
  tagVariants,
  textAligns,
} from "./component-options.ts";
export { formatting } from "./formatting.ts";
export { radii, radiusTokens } from "./radii.ts";
export { shadowTokens, shadows } from "./shadows.ts";
export { sizeTokens, sizes } from "./sizes.ts";
export { space, spaceTokens } from "./space.ts";
export { fontSizeTokens, fontSizes, fontWeightTokens, fontWeights } from "./typography.ts";
