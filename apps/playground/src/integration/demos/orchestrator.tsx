import { A2UIChat, useA2UIChat } from "@agentic-ui/a2ui-react";
import type { TurnState } from "@agentic-ui/a2ui-react/core";
import { useEffect } from "react";
import type { DemoProps } from "../demo-props.ts";

const ROUTE: Partial<Record<TurnState, string>> = {
  text: "только текст",
  ui: "текст + интерфейс",
  "failed-ui": "текст, интерфейс не удался",
};

/**
 * Orchestrator (auto UI, SV-C27): the server decides per message whether UI is needed (reference server:
 * `[reply] ui = "auto"`). Every reply shows its text; a surface only when the reply has valid UI; when UI
 * generation fails after the repairs, the text stays.
 */
export function OrchestratorDemo({ connection, showSurfaces }: DemoProps) {
  const chat = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  useEffect(() => {
    showSurfaces(chat.surfaces); // playground only: the Data model tab
  }, [chat.surfaces, showSurfaces]);
  return (
    <div className="flex flex-col gap-3">
      <A2UIChat
        chat={chat}
        renderPlaceholder={() => (
          <p data-testid="orchestrator-no-ui" className="text-[12px] text-muted-foreground">
            Интерфейс построить не удалось, ответ выше текстом.
          </p>
        )}
      />
      <ol className="flex flex-wrap gap-2 text-[12px]" aria-label="Маршрут ответов">
        {chat.turns.map((turn, index) =>
          turn.result === undefined ? null : (
            <li
              key={turn.id}
              data-testid="orchestrator-route"
              data-state={turn.result.state}
              className="rounded border px-2 py-0.5"
            >
              {index + 1}: {ROUTE[turn.result.state] ?? turn.result.state}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
