/**
 * The kit's reset for scoped mode — owned by the kit, so a fork changes it together with kit.ts.
 *
 * In scoped mode the kit renders inside a host page that has its own global CSS (the playground's
 * Tailwind v4 preflight, which lives in `@layer base`). This stylesheet is emitted unlayered, so it
 * wins over any layered host rule regardless of specificity, and every selector is wrapped in
 * `:where()`, so it never outranks a kit component class (exactly like Chakra's own global reset).
 *
 * 1. `revert` every property the host preflight sets back to the browser default, so the subtree
 *    starts from the same baseline as a page of its own.
 * 2. Chakra UI v1's CSSReset (`@chakra-ui/css-reset@1.1.3`), with `html`/`body` mapped to the root.
 * 3. The kit's mandatory `* { position: relative; box-sizing: border-box }`.
 */
export interface ScopedResetOptions {
  /** Applies `position: relative` to every element under the root (kit default: true). */
  readonly positionRelative: boolean;
}

export function scopedResetCss(root: string, { positionRelative }: ScopedResetOptions): string {
  const scope = (selectors: string) =>
    selectors
      .split(",")
      .map((selector) => `:where(${root}) ${selector.trim()}`)
      .join(",\n");
  const all = scope("*, ::before, ::after, ::backdrop, ::file-selector-button");

  return `
${root} {
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  font-family: system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  -moz-osx-font-smoothing: grayscale;
  touch-action: manipulation;
  position: relative;
  min-height: 100%;
  font-feature-settings: 'kern';
  font-variation-settings: normal;
  tab-size: 8;
  -webkit-tap-highlight-color: initial;
}

${all} {
  margin: revert;
  padding: revert;
  border: revert;
  border-color: revert;
}
${scope("hr")} { color: revert; }
${scope("code, kbd, samp, pre")} { font-feature-settings: revert; font-variation-settings: revert; }
${scope("table")} { text-indent: revert; border-color: revert; }
${scope("ol, ul, menu")} { list-style: revert; }
${scope("img, svg, video, canvas, audio, iframe, embed, object")} { vertical-align: revert; }
${scope("button, input, select, optgroup, textarea, ::file-selector-button")} {
  font-style: revert;
  font-weight: revert;
  font-stretch: revert;
  font-variant: revert;
  font-feature-settings: revert;
  font-variation-settings: revert;
  letter-spacing: revert;
  border-radius: revert;
  background-color: revert;
  opacity: revert;
}
${scope("button, input, ::file-selector-button")} { appearance: revert; }
${scope("::file-selector-button")} { margin-inline-end: revert; }
${scope("::placeholder")} { opacity: revert; color: revert; }
${scope("::-webkit-date-and-time-value")} { min-height: revert; text-align: revert; }
${scope("::-webkit-datetime-edit, ::-webkit-datetime-edit-fields-wrapper")} { display: revert; padding: revert; }
${scope("::-webkit-calendar-picker-indicator")} { line-height: revert; }
${scope("::-webkit-inner-spin-button, ::-webkit-outer-spin-button")} { height: revert; }

${all} {
  border-width: 0;
  border-style: solid;
  box-sizing: border-box;${positionRelative ? "\n  position: relative;" : ""}
}
${scope("main")} { display: block; }
${scope("hr")} { border-top-width: 1px; box-sizing: content-box; height: 0; overflow: visible; }
${scope("pre, code, kbd, samp")} { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 1em; }
${scope("a")} { background-color: transparent; color: inherit; text-decoration: inherit; }
${scope("abbr[title]")} { border-bottom: none; text-decoration: underline dotted; }
${scope("b, strong")} { font-weight: bold; }
${scope("small")} { font-size: 80%; }
${scope("sub, sup")} { font-size: 75%; line-height: 0; position: relative; vertical-align: baseline; }
${scope("sub")} { bottom: -0.25em; }
${scope("sup")} { top: -0.5em; }
${scope("img")} { border-style: none; }
${scope("button, input, optgroup, select, textarea")} { font-family: inherit; font-size: 100%; line-height: 1.15; margin: 0; }
${scope("button, input")} { overflow: visible; }
${scope("button, select")} { text-transform: none; }
${scope("fieldset")} { padding: 0.35em 0.75em 0.625em; }
${scope("legend")} { box-sizing: border-box; color: inherit; display: table; max-width: 100%; padding: 0; white-space: normal; }
${scope("progress")} { vertical-align: baseline; }
${scope("textarea")} { overflow: auto; }
${scope('[type="checkbox"], [type="radio"]')} { box-sizing: border-box; padding: 0; }
${scope('[type="number"]::-webkit-inner-spin-button, [type="number"]::-webkit-outer-spin-button')} { -webkit-appearance: none !important; }
${scope('input[type="number"]')} { -moz-appearance: textfield; }
${scope('[type="search"]')} { -webkit-appearance: textfield; outline-offset: -2px; }
${scope('[type="search"]::-webkit-search-decoration')} { -webkit-appearance: none !important; }
${scope("::-webkit-file-upload-button")} { -webkit-appearance: button; font: inherit; }
${scope("details")} { display: block; }
${scope("summary")} { display: list-item; }
${scope("template")} { display: none; }
${scope("[hidden]")} { display: none !important; }
${scope("blockquote, dl, dd, h1, h2, h3, h4, h5, h6, hr, figure, p, pre")} { margin: 0; }
${scope("button")} { background: transparent; padding: 0; }
${scope("fieldset")} { margin: 0; padding: 0; }
${scope("ol, ul")} { margin: 0; padding: 0; }
${scope("textarea")} { resize: vertical; }
${scope('button, [role="button"]')} { cursor: pointer; }
${scope("table")} { border-collapse: collapse; }
${scope("h1, h2, h3, h4, h5, h6")} { font-size: inherit; font-weight: inherit; }
${scope("button, input, optgroup, select, textarea")} { padding: 0; line-height: inherit; color: inherit; }
${scope("img, svg, video, canvas, audio, iframe, embed, object")} { display: block; }
${scope("img, video")} { max-width: 100%; height: auto; }
${scope("[data-js-focus-visible] :focus:not([data-focus-visible-added])")} { outline: none; box-shadow: none; }
`;
}
