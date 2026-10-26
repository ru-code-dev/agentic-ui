import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** CodeMirror theme matching the playground's dark shell and the Shiki github-dark-default palette. */
export const editorTheme = [
  EditorView.theme(
    {
      "&": { height: "100%", backgroundColor: "transparent", color: "#e6edf3", fontSize: "12.5px" },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.6",
      },
      ".cm-content": { padding: "12px 0", caretColor: "#e6edf3" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "#52525b",
        border: "none",
        paddingLeft: "8px",
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#a1a1aa" },
      ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "rgba(56,139,253,0.25) !important",
      },
      ".cm-cursor": { borderLeftColor: "#e6edf3" },
      ".cm-matchingBracket": { backgroundColor: "rgba(255,255,255,0.08)", outline: "none" },
      ".cm-foldGutter .cm-gutterElement": { color: "#52525b" },
      ".cm-lintRange-error": {
        backgroundImage: "none",
        textDecoration: "underline wavy #f87171",
        textUnderlineOffset: "3px",
      },
      ".cm-diagnostic": { fontFamily: "var(--font-sans)", fontSize: "12px" },
      ".cm-tooltip": {
        backgroundColor: "#18181b",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "8px",
        color: "#e4e4e7",
      },
      ".cm-panels": { backgroundColor: "#111113", color: "#e4e4e7" },
    },
    { dark: true },
  ),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.propertyName, color: "#79c0ff" },
      { tag: tags.string, color: "#a5d6ff" },
      { tag: tags.number, color: "#ffa657" },
      { tag: [tags.bool, tags.null], color: "#ff7b72" },
      { tag: [tags.brace, tags.squareBracket, tags.separator, tags.punctuation], color: "#8b949e" },
    ]),
  ),
];
