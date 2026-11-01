import {
  iconNames,
  alphaPalettes,
  baseColors,
  borderWidths,
  boxSizes,
  colorSchemes,
  fontSizes,
  fontWeights,
  palettes,
  radii,
  shadows,
  sizes,
  space,
} from "../src/index.ts";
import { cell } from "../src/docs/prop-docs.ts";

const recordTable = (title: string, record: Readonly<Record<string, string | number>>) =>
  [
    `#### ${title}`,
    "",
    "| Token | Value |",
    "|---|---|",
    ...Object.entries(record).map(([key, value]) => `| \`${key}\` | ${cell(String(value))} |`),
  ].join("\n");

/** The Tokens section of CONTRACTS.md. */
export function tokensSection(): string {
  const shades = Object.keys(palettes.gray);
  const allPalettes = { ...palettes, ...alphaPalettes } as Record<string, Record<string, string>>;
  const paletteRows = Object.entries(allPalettes).map(
    ([name, values]) => `| \`${name}\` | ${shades.map((shade) => values[shade]).join(" | ")} |`,
  );
  return [
    "## Tokens",
    "Every token is defined in `src/tokens.ts` (values copied from the Chakra UI v1 default theme). Color tokens are written `palette.shade` (e.g. `blue.500`) or one of " +
      Object.keys(baseColors)
        .map((name) => `\`${name}\``)
        .join(", ") +
      ". Palettes usable as `colorScheme`: " +
      colorSchemes.map((name) => `\`${name}\``).join(", ") +
      ".",
    [
      "#### Colors",
      "",
      `| Palette | ${shades.join(" | ")} |`,
      `|---|${shades.map(() => "---").join("|")}|`,
      ...paletteRows,
    ].join("\n"),
    recordTable("Space", space),
    recordTable("Radii", radii),
    recordTable("Font sizes", fontSizes),
    recordTable("Font weights", fontWeights),
    recordTable("Shadows", shadows),
    recordTable("Border widths", borderWidths),
    recordTable("Sizes (w, maxW, minH)", sizes),
    recordTable("Icon sizes", boxSizes.icon),
    recordTable("Avatar sizes", boxSizes.avatar),
    `#### Icon names\n\n${iconNames.map((name) => `\`${name}\``).join(" ")}`,
  ].join("\n\n");
}
