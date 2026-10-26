import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "../../components/ui/badge.tsx";
import type { PreviewError } from "../../state/session-store.ts";
import type { Analysis } from "../use-analysis.ts";
import { EmptyHint } from "./empty-hint.tsx";

interface Row {
  readonly key: string;
  readonly source: string;
  readonly message: string;
  readonly location?: string;
}

function rows(analysis: Analysis, previewErrors: readonly PreviewError[]): Row[] {
  const list: Row[] = [];
  if (!analysis.parse.ok) {
    const { message, line, column } = analysis.parse.error;
    list.push({
      key: "parse",
      source: "JSON",
      message,
      location: `line ${line}, column ${column}`,
    });
  }
  if (analysis.issue !== undefined) {
    const { message, path, line, column } = analysis.issue;
    list.push({
      key: "schema",
      source: "Schema",
      message,
      location: `${path} · line ${line}, column ${column}`,
    });
  }
  for (const error of previewErrors) {
    list.push({
      key: `preview-${error.id}`,
      source:
        error.source === "console" ? "Console" : error.source === "render" ? "Render" : "Runtime",
      message: error.message,
    });
  }
  return list;
}

export const errorCount = (analysis: Analysis, previewErrors: readonly PreviewError[]) =>
  rows(analysis, previewErrors).length;

/** JSON, schema, runtime/render and preview console errors (PG-09). */
export function ErrorsPanel({
  analysis,
  previewErrors,
}: {
  analysis: Analysis;
  previewErrors: readonly PreviewError[];
}) {
  const list = rows(analysis, previewErrors);
  if (list.length === 0) {
    return (
      <EmptyHint
        icon={CircleCheck}
        title="No errors"
        hint="The JSON parses, matches the ui-kit-one catalog and renders cleanly."
      />
    );
  }
  return (
    <ul className="divide-y" data-testid="errors-panel">
      {list.map((row) => (
        <li
          key={row.key}
          className="flex items-start gap-3 px-4 py-2.5 text-[13px]"
          data-testid="error-row"
        >
          <CircleX className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
          <Badge variant="outline" className="mt-px shrink-0 font-mono text-[10.5px]">
            {row.source}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="break-words">{row.message}</p>
            {row.location === undefined ? null : (
              <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">{row.location}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
