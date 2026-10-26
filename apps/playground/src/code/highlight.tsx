import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils.ts";

const THEME = "github-dark-default";

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import("@shikijs/themes/github-dark-default")],
    langs: [
      import("@shikijs/langs/json"),
      import("@shikijs/langs/tsx"),
      import("@shikijs/langs/typescript"),
      import("@shikijs/langs/markdown"),
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

export type CodeLanguage = "json" | "tsx" | "typescript" | "markdown";

const WRAP = "[&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]";

/** Read-only, Shiki-highlighted code (PG-22). `wrap` soft-wraps long lines instead of scrolling. */
export function HighlightedCode({
  code,
  lang,
  wrap = false,
}: {
  code: string;
  lang: CodeLanguage;
  wrap?: boolean;
}) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let current = true;
    void getHighlighter().then((instance) => {
      if (current) setHtml(instance.codeToHtml(code, { lang, theme: THEME }));
    });
    return () => {
      current = false;
    };
  }, [code, lang]);

  if (html === undefined) {
    return (
      <pre
        className={cn(
          "overflow-auto p-4 font-mono text-[12.5px] leading-relaxed text-muted-foreground",
          wrap && "whitespace-pre-wrap [overflow-wrap:anywhere]",
        )}
      >
        {code}
      </pre>
    );
  }
  return (
    <div
      data-testid="highlighted-code"
      className={cn(
        "font-mono text-[12.5px] leading-relaxed [&_pre]:p-4",
        wrap ? WRAP : "[&_pre]:min-w-max",
      )}
      // Shiki returns escaped, highlighted HTML for the given code string.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
