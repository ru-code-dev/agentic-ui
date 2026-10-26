import { iconNames, tokens } from "../src/index.ts";
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
  const shades = Object.keys(tokens.palettes.gray);
  const palettes = { ...tokens.palettes, ...tokens.alphaPalettes } as Record<
    string,
    Record<string, string>
  >;
  const paletteRows = Object.entries(palettes).map(
    ([name, values]) => `| \`${name}\` | ${shades.map((shade) => values[shade]).join(" | ")} |`,
  );
  return [
    "## Tokens",
    "Every token is defined in `src/tokens.ts` (values copied from the Chakra UI v1 default theme). Color tokens are written `palette.shade` (e.g. `blue.500`) or one of " +
      Object.keys(tokens.baseColors)
        .map((name) => `\`${name}\``)
        .join(", ") +
      ". Palettes usable as `colorScheme`: " +
      tokens.colorSchemes.map((name) => `\`${name}\``).join(", ") +
      ".",
    [
      "#### Colors",
      "",
      `| Palette | ${shades.join(" | ")} |`,
      `|---|${shades.map(() => "---").join("|")}|`,
      ...paletteRows,
    ].join("\n"),
    recordTable("Space", tokens.space),
    recordTable("Radii", tokens.radii),
    recordTable("Font sizes", tokens.fontSizes),
    recordTable("Font weights", tokens.fontWeights),
    recordTable("Shadows", tokens.shadows),
    recordTable("Border widths", tokens.borderWidths),
    recordTable("Sizes (w, maxW, minH)", tokens.sizes),
    recordTable("Icon sizes", tokens.boxSizes.icon),
    recordTable("Avatar sizes", tokens.boxSizes.avatar),
    `#### Icon names\n\n${iconNames.map((name) => `\`${name}\``).join(" ")}`,
  ].join("\n\n");
}
