import { Database } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { cn } from "../../lib/utils.ts";
import { EmptyHint } from "./empty-hint.tsx";

/** Live data model per surface; edit the JSON and Apply to send `updateDataModel` (PG-10). */
export function DataModelPanel({
  dataModels,
  onApply,
}: {
  dataModels: Readonly<Record<string, unknown>>;
  onApply: (surfaceId: string, value: unknown) => void;
}) {
  const surfaces = Object.keys(dataModels);
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const surfaceId = selected !== undefined && surfaces.includes(selected) ? selected : surfaces[0];

  if (surfaceId === undefined) {
    return (
      <EmptyHint
        icon={Database}
        title="No data model yet"
        hint="Surfaces report their data model here as soon as the preview renders them."
      />
    );
  }
  const live = JSON.stringify(dataModels[surfaceId], null, 2);
  const apply = () => {
    try {
      onApply(surfaceId, JSON.parse(draft ?? live));
      setDraft(undefined);
      setError(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2">
        {surfaces.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSelected(id);
              setDraft(undefined);
            }}
            className={cn(
              "truncate rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              id === surfaceId
                ? "bg-white/[0.07] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.04]",
            )}
          >
            {id}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <Textarea
          aria-label={`Data model of ${surfaceId}`}
          data-testid="data-model-editor"
          className="min-h-0 flex-1 font-mono text-[12px] leading-relaxed [&_textarea]:h-full"
          value={draft ?? live}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={apply} disabled={draft === undefined}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDraft(undefined)}
            disabled={draft === undefined}
          >
            Revert
          </Button>
          <span
            className={cn(
              "text-[12px]",
              error ? "text-destructive-foreground" : "text-muted-foreground",
            )}
          >
            {error ??
              (draft === undefined
                ? "Live — updates as you interact with the preview"
                : "Edited — Apply sends updateDataModel to the preview")}
          </span>
        </div>
      </div>
    </div>
  );
}
