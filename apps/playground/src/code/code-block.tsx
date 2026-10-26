import { Download } from "lucide-react";
import { CopyButton } from "../components/copy-button.tsx";
import { IconButton } from "../components/icon-button.tsx";
import { downloadText } from "../lib/download.ts";
import { HighlightedCode, type CodeLanguage } from "./highlight.tsx";

interface CodeBlockProps {
  readonly code: string;
  readonly lang: CodeLanguage;
  /** Soft-wrap long lines (prose, minified JSON). */
  readonly wrap?: boolean;
  readonly title?: string;
  readonly filename?: string;
}

/** Read-only, Shiki-highlighted code with copy (and download when `filename` is set). */
export function CodeBlock({ code, lang, title, filename, wrap = false }: CodeBlockProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="truncate font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
          {title ?? lang}
        </span>
        <div className="flex items-center gap-0.5">
          {filename === undefined ? null : (
            <IconButton
              label="Download"
              onClick={() =>
                downloadText(filename, code, lang === "json" ? "application/json" : "text/plain")
              }
            >
              <Download />
            </IconButton>
          )}
          <CopyButton text={code} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <HighlightedCode code={code} lang={lang} wrap={wrap} />
      </div>
    </div>
  );
}
