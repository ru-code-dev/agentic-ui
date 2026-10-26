import type { PromptSection } from "@agentic-ui/ui-kit-one-catalog/prompt";
import { Download } from "lucide-react";
import { HighlightedCode } from "../code/highlight.tsx";
import { CopyButton } from "../components/copy-button.tsx";
import { IconButton } from "../components/icon-button.tsx";
import { downloadText } from "../lib/download.ts";
import { SECTION_COLORS } from "./section-colors.ts";

/** The full assembled prompt, one highlighted block per section with anchors (PG-26 g). */
export function PromptViewer({
  text,
  sections,
}: {
  text: string;
  sections: readonly PromptSection[];
}) {
  return (
    <section
      className="flex flex-col overflow-hidden rounded-xl border bg-card"
      aria-label="Assembled prompt"
      data-testid="prompt-viewer"
    >
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="font-medium text-[13px]">Assembled system prompt</h2>
        <div className="flex items-center gap-0.5">
          <IconButton
            label="Download"
            onClick={() => downloadText("system-prompt.md", text, "text/markdown")}
          >
            <Download />
          </IconButton>
          <CopyButton text={text} label="Copy prompt" />
        </div>
      </div>
      <nav className="flex flex-wrap gap-1.5 border-b px-5 py-2.5" aria-label="Sections">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#prompt-${section.id}`}
            className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: SECTION_COLORS[section.id] }}
            />
            {section.title}
          </a>
        ))}
      </nav>
      <div className="max-h-[640px] overflow-auto">
        {sections.map((section) => (
          <div
            key={section.id}
            id={`prompt-${section.id}`}
            className="scroll-mt-4 border-b last:border-b-0"
          >
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-5 py-1.5 text-[11px] text-muted-foreground uppercase tracking-wider backdrop-blur">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: SECTION_COLORS[section.id] }}
              />
              {section.title}
            </div>
            <HighlightedCode code={section.text} lang="markdown" wrap />
          </div>
        ))}
      </div>
    </section>
  );
}
