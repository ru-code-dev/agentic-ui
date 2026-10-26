import { useMemo, useRef, type ReactNode } from "react";
import {
  CSSReset,
  DarkMode,
  EmotionThemeProvider,
  Global,
  GlobalStyle,
  IdProvider,
  LightMode,
  ThemeProvider,
  css,
  extendTheme,
  scopedResetCss,
  toCSSVar,
} from "./kit/index.ts";
import { KitEnvironmentContext } from "./kit-environment.ts";

export type ColorMode = "light" | "dark";

/** The single color-mode switch of the kit. */
export const DEFAULT_COLOR_MODE: ColorMode = "dark";

/** Attribute that marks the root element of a scoped kit subtree. */
export const UI_KIT_ROOT_ATTRIBUTE = "data-ui-kit-root";
const ROOT_SELECTOR = `[${UI_KIT_ROOT_ATTRIBUTE}]`;

export interface UiKitProviderProps {
  readonly children: ReactNode;
  /**
   * `document`: the kit owns the page — global reset, body styles and `:root` CSS variables, as a
   * stock ChakraProvider does.
   * `scoped`: the kit is embedded in a host page — reset, theme globals, CSS variables and overlay
   * portals are confined to a `[data-ui-kit-root]` element; nothing is written to html or body.
   */
  readonly mode?: "document" | "scoped";
  readonly colorMode?: ColorMode;
  /** Scoped mode only: the kit's `* { position: relative }` reset rule. */
  readonly positionRelativeReset?: boolean;
}

const theme = extendTheme({
  config: { initialColorMode: DEFAULT_COLOR_MODE, useSystemColorMode: false },
});
const cssVarTheme = toCSSVar(theme);

type GlobalStyles = (props: {
  colorMode: ColorMode;
  theme: typeof cssVarTheme;
}) => Record<string, object>;

/** Maps a theme global-style selector into the scoped root (`body`/`html` become the root itself). */
function scopeSelector(selector: string): string {
  return selector
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed === "body" || trimmed === "html") return ROOT_SELECTOR;
      return `:where(${ROOT_SELECTOR}) ${trimmed}`;
    })
    .join(", ");
}

function scopedStyles(colorMode: ColorMode, positionRelative: boolean) {
  const globals = (cssVarTheme.styles.global as GlobalStyles)({ colorMode, theme: cssVarTheme });
  const scopedGlobals = Object.fromEntries(
    Object.entries(globals).map(([selector, rules]) => [scopeSelector(selector), rules]),
  );
  return [
    scopedResetCss(ROOT_SELECTOR, { positionRelative }),
    { [ROOT_SELECTOR]: cssVarTheme.__cssVars },
    css(scopedGlobals)(cssVarTheme),
  ];
}

/** Provides the UI kit to the A2UI surfaces rendered below it. */
export function UiKitProvider({
  children,
  mode = "document",
  colorMode = DEFAULT_COLOR_MODE,
  positionRelativeReset = true,
}: UiKitProviderProps) {
  const portalContainer = useRef<HTMLDivElement>(null);
  const ColorModeLock = colorMode === "dark" ? DarkMode : LightMode;
  const scoped = mode === "scoped";
  const environment = useMemo(
    () => ({ scoped, portalContainer: scoped ? portalContainer : undefined }),
    [scoped],
  );
  const styles = useMemo(
    () => (scoped ? scopedStyles(colorMode, positionRelativeReset) : undefined),
    [scoped, colorMode, positionRelativeReset],
  );

  const content = (
    <ColorModeLock>
      <KitEnvironmentContext.Provider value={environment}>
        {children}
      </KitEnvironmentContext.Provider>
    </ColorModeLock>
  );

  return (
    <IdProvider>
      {scoped ? (
        <EmotionThemeProvider theme={cssVarTheme}>
          <Global styles={styles} />
          <div {...{ [UI_KIT_ROOT_ATTRIBUTE]: "" }}>
            {content}
            <div ref={portalContainer} />
          </div>
        </EmotionThemeProvider>
      ) : (
        <ThemeProvider theme={theme}>
          <ColorModeLock>
            <CSSReset />
            <GlobalStyle />
          </ColorModeLock>
          {content}
        </ThemeProvider>
      )}
    </IdProvider>
  );
}
