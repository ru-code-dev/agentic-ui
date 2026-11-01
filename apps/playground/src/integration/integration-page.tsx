import type { Surface } from "@agentic-ui/a2ui-react";
import { useCallback, useMemo, useState } from "react";
import { CodeBlock } from "../code/code-block.tsx";
import { ScrollArea } from "../components/ui/scroll-area.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/ui/tabs.tsx";
import { cn } from "../lib/utils.ts";
import { connect, type LoggedCall, type Mode } from "./connection.ts";
import { DataModelTab, EventsTab } from "./integration-panels.tsx";
import { INTEGRATION_PAGES, integrationPage, type IntegrationPage as Page } from "./pages.ts";

const MODES: readonly { readonly mode: Mode; readonly label: string; readonly hint: string }[] = [
  { mode: "scripted", label: "Scripted", hint: "встроенный агент в браузере: без сервера и LLM" },
  { mode: "live", label: "Live", hint: "наш агент-сервер через dev-прокси /api" },
];

function ModeSwitch({ mode, choose }: { mode: Mode; choose: (mode: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="Режим" className="flex rounded-md border p-0.5">
      {MODES.map((option) => (
        <button
          key={option.mode}
          type="button"
          role="radio"
          aria-checked={mode === option.mode}
          title={option.hint}
          onClick={() => choose(option.mode)}
          className={cn(
            "rounded px-2.5 py-1 text-[12px] transition-colors",
            mode === option.mode ? "bg-white/[0.09] text-foreground" : "text-muted-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** One demo run: a fresh connection (and so a fresh chat) per page and mode. */
function Run({ page, mode }: { page: Page; mode: Mode }) {
  const [calls, setCalls] = useState<readonly LoggedCall[]>([]);
  const [surfaces, setSurfaces] = useState<readonly Surface[]>([]);
  const connection = useMemo(() => {
    let id = 0;
    return connect({
      mode,
      script: page.script(),
      optional: page.optional,
      log: (call) => setCalls((all) => [...all, { ...call, id: ++id }]),
    });
  }, [page, mode]);
  const showSurfaces = useCallback((list: readonly Surface[]) => setSurfaces(list), []);
  const { Demo } = page;
  return (
    <Tabs defaultValue="demo" className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex h-10 shrink-0 items-center border-b px-3">
        <TabsList variant="underline" className="-mb-px h-10 py-0">
          <TabsTab value="demo">Demo</TabsTab>
          <TabsTab value="code">Code</TabsTab>
          <TabsTab value="events">Events {calls.length === 0 ? null : calls.length}</TabsTab>
          <TabsTab value="data">Data model</TabsTab>
        </TabsList>
      </div>
      <TabsPanel value="demo" keepMounted className="min-h-0 flex-1 data-[hidden]:hidden">
        <ScrollArea className="h-full">
          <div className="p-5" data-testid="integration-demo" data-mode={mode}>
            <Demo connection={connection} showSurfaces={showSurfaces} />
          </div>
        </ScrollArea>
      </TabsPanel>
      <TabsPanel value="code" className="min-h-0 flex-1 p-4">
        <CodeBlock code={page.source} lang="tsx" title={page.file} />
      </TabsPanel>
      <TabsPanel value="events" className="min-h-0 flex-1 overflow-auto">
        <EventsTab calls={calls} clear={() => setCalls([])} />
      </TabsPanel>
      <TabsPanel value="data" className="min-h-0 flex-1 overflow-auto">
        <DataModelTab surfaces={surfaces} />
      </TabsPanel>
    </Tabs>
  );
}

/**
 * `/integration/<page>` (SV-C26, SV-C27): how a consumer project uses `@agentic-ui/a2ui-react`, one page per
 * integration style; Scripted runs a built-in deterministic agent, Live talks to our agent server.
 */
export function IntegrationPage({ slug }: { slug: string }) {
  const page = integrationPage(slug) ?? INTEGRATION_PAGES[0];
  const [mode, setMode] = useState<Mode>("scripted");
  if (page === undefined) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-4 border-b px-5 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-semibold text-[15px]">{page.title}</h1>
          <p className="text-[12.5px] text-muted-foreground">{page.summary}</p>
          <p className="text-[11.5px] text-muted-foreground/80">{page.live}</p>
        </div>
        <ModeSwitch mode={mode} choose={setMode} />
      </header>
      <Run key={`${page.slug}-${mode}`} page={page} mode={mode} />
    </div>
  );
}
