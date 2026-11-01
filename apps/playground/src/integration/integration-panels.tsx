import type { Surface } from "@agentic-ui/a2ui-react";
import { Activity, Database } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { useDataModels } from "../agent/use-data-models.ts";
import { EmptyHint } from "../workspace/panels/empty-hint.tsx";
import type { LoggedCall } from "./connection.ts";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const short = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text === undefined ? "—" : text.length > 400 ? `${text.slice(0, 400)}…` : text;
};

/** Every request of the demo (method, endpoint, body) and its answer (status, body), newest first. */
export function EventsTab({ calls, clear }: { calls: readonly LoggedCall[]; clear: () => void }) {
  if (calls.length === 0)
    return (
      <EmptyHint
        icon={Activity}
        title="Запросов пока нет"
        hint="Отправьте сообщение или нажмите кнопку в интерфейсе: здесь появятся запросы и ответы."
      />
    );
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-1.5 text-[12px] text-muted-foreground">
        {calls.length} запросов
        <Button size="xs" variant="ghost" onClick={clear}>
          Очистить
        </Button>
      </div>
      <ol>
        {calls.toReversed().map((call) => (
          <li
            key={call.id}
            data-testid="integration-event"
            data-request={call.request}
            data-status={call.status}
            className="flex flex-col gap-0.5 border-b px-4 py-2 font-mono text-[11.5px]"
          >
            <span>
              <span className="text-muted-foreground">{time(call.time)}</span> {call.request} →{" "}
              <span data-testid="integration-event-status">{call.status}</span>
            </span>
            <span className="break-all text-muted-foreground">{short(call.body)}</span>
            <span className="break-all">{short(call.reply)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The live data model of every surface of the demo. */
export function DataModelTab({ surfaces }: { surfaces: readonly Surface[] }) {
  const models = useDataModels(surfaces);
  const ids = Object.keys(models);
  if (ids.length === 0)
    return (
      <EmptyHint
        icon={Database}
        title="Поверхностей пока нет"
        hint="Модель данных каждой поверхности демо появится здесь, вместе с вводом в поля."
      />
    );
  return (
    <div className="flex flex-col gap-3 p-4">
      {ids.map((id) => (
        <section key={id} data-testid="integration-data-model" data-surface-id={id}>
          <h3 className="pb-1 font-mono text-[12px] text-muted-foreground">{id}</h3>
          <pre className="overflow-auto rounded-md border bg-panel p-2 font-mono text-[12px]">
            {JSON.stringify(models[id], null, 2)}
          </pre>
        </section>
      ))}
    </div>
  );
}
