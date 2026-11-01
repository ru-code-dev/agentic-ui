import { A2UIChat, useA2UIChat } from "@agentic-ui/a2ui-react";
import { useEffect } from "react";
import type { DemoProps } from "../demo-props.ts";

/**
 * Minimal server: a backend with only `POST /prompt` and `POST /action` (SV-C26). The optional endpoints are
 * probed once and their absence never fails the chat: no model dropdown, a plain working state, and Cancel
 * aborts the request in the browser.
 */
export function MinimalServerDemo({ connection, showSurfaces }: DemoProps) {
  const chat = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  useEffect(() => {
    showSurfaces(chat.surfaces); // playground only: the Data model tab
  }, [chat.surfaces, showSurfaces]);
  return (
    <div className="flex flex-col gap-3">
      <p data-testid="minimal-capabilities" className="text-[12px] text-muted-foreground">
        {chat.models === undefined ? "Нет /models: выбора модели нет" : "Сервер отдаёт /models"} ·
        Отмена: {chat.models === undefined ? "прерывает запрос на странице" : "через /cancel"}
      </p>
      <A2UIChat chat={chat} />
    </div>
  );
}
