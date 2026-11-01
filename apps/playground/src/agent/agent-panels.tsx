import type { UseA2UIChat } from "@agentic-ui/a2ui-react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/ui/tabs.tsx";
import { DataModelPanel } from "../workspace/panels/data-model-panel.tsx";
import { EventsPanel } from "../workspace/panels/events-panel.tsx";
import { agentLog } from "./agent-chat.ts";
import { useDataModels } from "./use-data-models.ts";

const count = (value: number) =>
  value === 0 ? null : (
    <span className="ml-1.5 rounded-full bg-white/[0.07] px-1.5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
      {value}
    </span>
  );

/** Events and Data model of the agent's surfaces, as in the workspace (PG-10, PG-11). */
export function AgentPanels({ chat }: { chat: UseA2UIChat }) {
  const events = agentLog.useLog((state) => state.events);
  const dataModels = useDataModels(chat.surfaces);
  // A4-20: an edit is checked against the chat's merged surfaces; the panel shows why it was refused.
  const applyDataModel = (surfaceId: string, value: unknown) =>
    chat.chat.surfaces.editDataModel(surfaceId, value);
  return (
    <Tabs defaultValue="events" className="flex h-full min-h-0 flex-col gap-0 bg-panel">
      <div className="flex h-10 shrink-0 items-center border-b px-3">
        <TabsList variant="underline" className="-mb-px h-10 py-0">
          <TabsTab value="events">
            Events
            {count(events.length)}
          </TabsTab>
          <TabsTab value="data">
            Data model
            {count(Object.keys(dataModels).length)}
          </TabsTab>
        </TabsList>
      </div>
      <TabsPanel value="events" className="min-h-0 flex-1 overflow-auto">
        <EventsPanel events={events} onClear={agentLog.clear} />
      </TabsPanel>
      <TabsPanel value="data" className="min-h-0 flex-1 overflow-hidden">
        <DataModelPanel dataModels={dataModels} onApply={applyDataModel} />
      </TabsPanel>
    </Tabs>
  );
}
