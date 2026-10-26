import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/ui/tabs.tsx";
import { useSession } from "../state/session-store.ts";
import { useWorkspace } from "../state/workspace-store.ts";
import { CatalogPanel } from "./panels/catalog-panel.tsx";
import { DataModelPanel } from "./panels/data-model-panel.tsx";
import { ErrorsPanel, errorCount } from "./panels/errors-panel.tsx";
import { EventsPanel } from "./panels/events-panel.tsx";
import { MockRulesPanel } from "./panels/mock-rules-panel.tsx";
import { PromptPanel } from "./panels/prompt-panel.tsx";
import type { Analysis } from "./use-analysis.ts";

function Count({ value, tone = "muted" }: { value: number; tone?: "muted" | "error" }) {
  if (value === 0) return null;
  return (
    <span
      className={
        tone === "error"
          ? "ml-1.5 rounded-full bg-destructive/15 px-1.5 font-mono text-[10.5px] text-destructive-foreground tabular-nums"
          : "ml-1.5 rounded-full bg-white/[0.07] px-1.5 font-mono text-[10.5px] text-muted-foreground tabular-nums"
      }
    >
      {value}
    </span>
  );
}

/** Bottom panel: errors, data model, events, mock rules, catalog and prompt (PG-09..PG-14). */
export function BottomPanel({
  analysis,
  onApplyDataModel,
}: {
  analysis: Analysis;
  onApplyDataModel: (surfaceId: string, value: unknown) => void;
}) {
  const previewErrors = useSession((state) => state.previewErrors);
  const events = useSession((state) => state.events.length);
  const surfaces = useSession((state) => Object.keys(state.dataModels).length);
  const rules = useWorkspace((state) => state.mockRules.length);
  return (
    <Tabs defaultValue="errors" className="flex h-full min-h-0 flex-col gap-0 bg-panel">
      <div className="flex h-10 shrink-0 items-center border-b px-3">
        <TabsList variant="underline" className="-mb-px h-10 py-0">
          <TabsTab value="errors">
            Errors
            <Count value={errorCount(analysis, previewErrors)} tone="error" />
          </TabsTab>
          <TabsTab value="data">
            Data model
            <Count value={surfaces} />
          </TabsTab>
          <TabsTab value="events">
            Events
            <Count value={events} />
          </TabsTab>
          <TabsTab value="mocks">
            Mock rules
            <Count value={rules} />
          </TabsTab>
          <TabsTab value="catalog">Catalog</TabsTab>
          <TabsTab value="prompt">Prompt</TabsTab>
        </TabsList>
      </div>
      <TabsPanel value="errors" className="min-h-0 flex-1 overflow-auto">
        <ErrorsPanel analysis={analysis} previewErrors={previewErrors} />
      </TabsPanel>
      <TabsPanel value="data" className="min-h-0 flex-1 overflow-hidden">
        <DataModelPanel onApply={onApplyDataModel} />
      </TabsPanel>
      <TabsPanel value="events" className="min-h-0 flex-1 overflow-auto">
        <EventsPanel />
      </TabsPanel>
      <TabsPanel value="mocks" className="min-h-0 flex-1 overflow-auto">
        <MockRulesPanel />
      </TabsPanel>
      <TabsPanel value="catalog" className="min-h-0 flex-1 overflow-hidden p-3">
        <CatalogPanel />
      </TabsPanel>
      <TabsPanel value="prompt" className="min-h-0 flex-1 overflow-hidden p-3">
        <PromptPanel />
      </TabsPanel>
    </Tabs>
  );
}
