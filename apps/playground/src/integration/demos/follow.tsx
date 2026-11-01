import { A2UIChat, useA2UIChat } from "@agentic-ui/a2ui-react";
import { useEffect } from "react";
import type { DemoProps } from "../demo-props.ts";

/**
 * Follow: a surface moves under the latest turn that created or updated it, so the surface the user just
 * acted on is always next to the newest reply; `interactive="latest"` keeps only those surfaces editable.
 */
export function FollowDemo({ connection, showSurfaces }: DemoProps) {
  const chat = useA2UIChat({ endpoint: connection.endpoint, fetch: connection.fetch });
  useEffect(() => {
    showSurfaces(chat.surfaces); // playground only: the Data model tab
  }, [chat.surfaces, showSurfaces]);
  return <A2UIChat chat={chat} placement="follow" interactive="latest" />;
}
