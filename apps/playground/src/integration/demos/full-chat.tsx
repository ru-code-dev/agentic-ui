import { A2UIChat, useA2UIChat } from "@agentic-ui/a2ui-react";
import { useEffect } from "react";
import type { DemoProps } from "../demo-props.ts";

/**
 * Full chat: the package's default chat. A surface stays under the turn that created it (`anchored`); an
 * action or a refinement updates it there in place, a new topic creates a new surface under its own turn.
 */
export function FullChatDemo({ connection, showSurfaces }: DemoProps) {
  const chat = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  useEffect(() => {
    showSurfaces(chat.surfaces); // playground only: the Data model tab
  }, [chat.surfaces, showSurfaces]);
  return <A2UIChat chat={chat} placement="anchored" />;
}
