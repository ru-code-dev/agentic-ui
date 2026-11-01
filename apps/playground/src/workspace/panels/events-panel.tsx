import { Activity, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import type { LoggedEvent } from "../../state/session-store.ts";
import { EmptyHint } from "./empty-hint.tsx";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const compact = (value: unknown) => (value === undefined ? "—" : JSON.stringify(value));

/** Outgoing actions and agent replies (simulated or real), newest first (PG-11). */
export function EventsPanel({
  events,
  onClear: clear,
}: {
  events: readonly LoggedEvent[];
  onClear: () => void;
}) {
  if (events.length === 0) {
    return (
      <EmptyHint
        icon={Activity}
        title="No events yet"
        hint="Press a button in the preview: its action, context and data model appear here."
      />
    );
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-1.5">
        <span className="text-[12px] text-muted-foreground">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
        <Button size="xs" variant="ghost" onClick={clear}>
          <Trash2 />
          Clear
        </Button>
      </div>
      <table className="w-full text-left text-[12.5px]" data-testid="events-table">
        <thead className="text-[11px] text-muted-foreground uppercase tracking-wider">
          <tr className="border-b">
            <th className="px-4 py-1.5 font-medium">Time</th>
            <th className="py-1.5 font-medium">Kind</th>
            <th className="py-1.5 font-medium">Surface</th>
            <th className="py-1.5 font-medium">Name</th>
            <th className="py-1.5 font-medium">Context</th>
            <th className="py-1.5 pr-4 font-medium">Data model</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {events.toReversed().map((event) => (
            <tr key={event.id} data-testid="event-row" className="align-top">
              <td className="px-4 py-2 font-mono text-muted-foreground tabular-nums">
                {time(event.time)}
              </td>
              <td className="py-2">
                <Badge variant={event.kind === "action" ? "info" : "success"}>
                  {event.kind === "action" ? "action" : "reply"}
                </Badge>
              </td>
              <td className="py-2 font-mono">{event.surfaceId}</td>
              <td className="py-2 font-mono" data-testid="event-name">
                {event.name}
              </td>
              <td
                className="max-w-64 truncate py-2 font-mono text-muted-foreground"
                title={compact(event.context)}
              >
                {compact(event.context)}
              </td>
              <td
                className="max-w-80 truncate py-2 pr-4 font-mono text-muted-foreground"
                title={compact(event.dataModel)}
              >
                {compact(event.dataModel)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
