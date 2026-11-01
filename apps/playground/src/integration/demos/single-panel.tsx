import { A2UIChat, useA2UIChat } from "@agentic-ui/a2ui-react";
import { useEffect } from "react";
import type { DemoProps } from "../demo-props.ts";

/**
 * Single panel: the transcript on the left, ONE surface in a panel on the right. The server runs the
 * prompt mode `surfaces = "single"` (agent-server TOML `[reply]`), so every turn updates the same surface.
 */
export function SinglePanelDemo({ connection, showSurfaces }: DemoProps) {
  const chat = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  useEffect(() => {
    showSurfaces(chat.surfaces); // playground only: the Data model tab
  }, [chat.surfaces, showSurfaces]);
  return <A2UIChat chat={chat} placement="panel" />;
}
