import { A2UIChat, useA2UIChat, type Surface } from "@agentic-ui/a2ui-react";
import type { ChatTurn } from "@agentic-ui/a2ui-react/core";
import { useEffect, useState } from "react";
import type { DemoProps } from "../demo-props.ts";

const plain = (value: unknown): unknown =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/** The messages of a turn that target `surfaceId` (what created or changed it). */
const messagesFor = (messages: readonly unknown[], surfaceId: string) =>
  messages.filter((message) =>
    Object.values(message as Record<string, unknown>).some(
      (body) => (body as { surfaceId?: unknown } | null)?.surfaceId === surfaceId,
    ),
  );

function SurfaceStory({ surface, turns }: { surface: Surface; turns: readonly ChatTurn[] }) {
  const [dataModel, setDataModel] = useState(() => plain(surface.dataModel.get("/")));
  useEffect(() => {
    const subscription = surface.dataModel.subscribe("/", (value) => setDataModel(plain(value)));
    return () => {
      subscription.unsubscribe();
    };
  }, [surface]);
  return (
    <section
      data-testid="surface-story"
      data-surface-id={surface.id}
      className="flex flex-col gap-1"
    >
      <h3 className="font-mono text-[13px]">{surface.id}</h3>
      <ol className="flex flex-col gap-1 text-[12px]">
        {turns.map((turn, index) => {
          const { result } = turn;
          const created = result?.created.includes(surface.id) === true;
          if (!created && result?.updated.includes(surface.id) !== true) return null;
          const asked = turn.request.kind === "prompt" ? turn.request.text : turn.request.name;
          return (
            <li
              key={turn.id}
              data-testid="surface-step"
              data-kind={created ? "created" : "updated"}
            >
              Ход {index + 1} ({asked}): {created ? "создана" : "обновлена"}
              <pre className="max-h-32 overflow-auto rounded bg-black/20 p-1 font-mono text-[11px]">
                {JSON.stringify(messagesFor(result?.messages ?? [], surface.id), null, 1)}
              </pre>
            </li>
          );
        })}
      </ol>
      <pre data-testid="surface-data" className="rounded bg-black/20 p-1 font-mono text-[11px]">
        {JSON.stringify(dataModel, null, 1)}
      </pre>
    </section>
  );
}

/**
 * Surface history: per surface, the turn that created it, the turns that updated it in place, the A2UI
 * messages that did it (`turn.result.messages`) and its current data model.
 */
export function SurfaceHistoryDemo({ connection, showSurfaces }: DemoProps) {
  const chat = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  useEffect(() => {
    showSurfaces(chat.surfaces); // playground only: the Data model tab
  }, [chat.surfaces, showSurfaces]);
  return (
    <div className="grid grid-cols-[3fr_2fr] gap-6">
      <A2UIChat chat={chat} />
      <aside aria-label="История поверхностей" className="flex flex-col gap-4">
        {chat.surfaces.map((surface) => (
          <SurfaceStory key={surface.id} surface={surface} turns={chat.turns} />
        ))}
      </aside>
    </div>
  );
}
