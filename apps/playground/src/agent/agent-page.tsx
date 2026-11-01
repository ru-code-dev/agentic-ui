import { useA2UIChat } from "@agentic-ui/a2ui-react";
import { SquarePen } from "lucide-react";
import { Group, Panel } from "react-resizable-panels";
import { PaneHeader } from "../components/pane-header.tsx";
import { Button } from "../components/ui/button.tsx";
import { ScrollArea } from "../components/ui/scroll-area.tsx";
import { ResizeHandle } from "../workspace/resize-handle.tsx";
import { agentChat, agentLog } from "./agent-chat.ts";
import { AgentPanels } from "./agent-panels.tsx";
import { AgentPreview } from "./agent-preview.tsx";
import { ChatHistory } from "./chat-history.tsx";
import { Composer } from "./composer.tsx";
import { ModelSelect } from "./model-select.tsx";

/**
 * `/agent`: chat with the agent server (P8), built on the package (`useA2UIChat` over the page's headless
 * chat, `<A2UISurface>` in the preview; SV-C26 dogfooding) with Events and Data model tabs.
 */
export function AgentPage() {
  const chat = useA2UIChat({ chat: agentChat, onAction: agentLog.action, onError: agentLog.error });
  const busy = chat.working !== undefined || chat.models?.pending === true;
  return (
    <Group orientation="horizontal" className="min-h-0 flex-1">
      <Panel defaultSize="38" minSize="26">
        <div className="flex h-full min-w-0 flex-col bg-background">
          <PaneHeader
            actions={
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void chat.chat.reset()}
                disabled={busy}
              >
                <SquarePen />
                Новый чат
              </Button>
            }
          >
            <span className="font-medium">Агент</span>
            <ModelSelect chat={chat} />
          </PaneHeader>
          <ScrollArea className="min-h-0 flex-1">
            <ChatHistory chat={chat} />
          </ScrollArea>
          <Composer chat={chat} />
        </div>
      </Panel>
      <ResizeHandle orientation="horizontal" />
      <Panel minSize="30">
        <Group orientation="vertical">
          <Panel defaultSize="64" minSize="25">
            <div className="flex h-full flex-col">
              <AgentPreview chat={chat} />
            </div>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize="36" minSize="12">
            <AgentPanels chat={chat} />
          </Panel>
        </Group>
      </Panel>
    </Group>
  );
}
