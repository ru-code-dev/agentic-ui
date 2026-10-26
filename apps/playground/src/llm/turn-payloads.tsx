import { MousePointerClick } from "lucide-react";
import { HighlightedCode } from "../code/highlight.tsx";
import { EmptyHint } from "../workspace/panels/empty-hint.tsx";
import { formatTokens } from "./section-colors.ts";

/** What each user turn adds to the context: action event and data model (PG-26 d). */
export function TurnPayloads({
  payloads,
}: {
  payloads: ReadonlyArray<{ label: string; json: string; tokens: number }>;
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border bg-card p-5"
      aria-label="Per-turn payloads"
      data-testid="turn-payloads"
    >
      <h2 className="font-medium text-[13px]">Per-turn payloads</h2>
      <p className="text-[12px] text-muted-foreground">
        From the current workspace: the latest action fired in the preview, or the first action of
        the editor content.
      </p>
      {payloads.length === 0 && (
        <EmptyHint
          icon={MousePointerClick}
          title="No action to send"
          hint="The editor content has no Button action yet, or its JSON does not parse."
        />
      )}
      <div className="grid gap-3 xl:grid-cols-2">
        {payloads.map((payload) => (
          <div key={payload.label} className="overflow-hidden rounded-lg border bg-panel">
            <div className="flex items-center justify-between border-b px-3 py-1.5 text-[12px]">
              <span>{payload.label}</span>
              <span className="font-mono text-muted-foreground">
                {formatTokens(payload.tokens)} tokens
              </span>
            </div>
            <div className="max-h-48 overflow-auto">
              <HighlightedCode code={payload.json} lang="json" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
