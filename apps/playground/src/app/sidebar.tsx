import { Blocks, Bot, Gauge, LayoutPanelLeft, PlugZap, RotateCcw } from "lucide-react";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { ScrollArea } from "../components/ui/scroll-area.tsx";
import { componentExamples, compositions, type Example } from "../examples.ts";
import { INTEGRATION_NAV } from "../integration/nav.ts";
import { cn } from "../lib/utils.ts";
import { useSession } from "../state/session-store.ts";
import { useWorkspace } from "../state/workspace-store.ts";
import { Link, navigate } from "./router.tsx";

const PAGES = [
  { to: "/", label: "Workspace", icon: LayoutPanelLeft },
  { to: "/components", label: "Components", icon: Blocks },
  { to: "/llm-context", label: "LLM context", icon: Gauge },
  { to: "/agent", label: "Agent", icon: Bot },
] as const;

/** SV-C26: the Integration section (how a consumer project uses @agentic-ui/a2ui-react). */
function IntegrationNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Интеграция" className="flex flex-col gap-0.5 px-2 pb-2">
      <h2 className="flex items-center gap-2 px-2.5 pb-1 pt-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
        <PlugZap className="size-3.5" />
        Интеграция
      </h2>
      {INTEGRATION_NAV.map(({ slug, title }) => {
        const to = `/integration/${slug}`;
        const active = pathname === to || (pathname === "/integration" && slug === "full-chat");
        return (
          <Link
            key={slug}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-7 items-center rounded-md px-2.5 text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-white/[0.07] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            {title}
          </Link>
        );
      })}
    </nav>
  );
}

function ExampleItem({ example, active }: { example: Example; active: boolean }) {
  return (
    <button
      type="button"
      data-testid={`example-${example.id}`}
      aria-current={active ? "true" : undefined}
      onClick={() => {
        useWorkspace.getState().select(example);
        navigate("/");
      }}
      className={cn(
        "group relative flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left outline-none transition-colors",
        "hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring",
        active &&
          "bg-white/[0.06] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand",
      )}
    >
      <span
        className={cn("truncate text-[13px]", active ? "text-foreground" : "text-foreground/85")}
      >
        {example.name}
      </span>
      <span className="line-clamp-1 text-[11.5px] text-muted-foreground">
        {example.description}
      </span>
    </button>
  );
}

function Section({
  title,
  examples,
  selectedId,
}: {
  title: string;
  examples: readonly Example[];
  selectedId: string | undefined;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-0.5">
      <h2 className="flex items-center justify-between px-2.5 pb-1 pt-4 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
        {title}
        <span className="font-normal tabular-nums">{examples.length}</span>
      </h2>
      {examples.map((example) => (
        <ExampleItem key={example.id} example={example} active={example.id === selectedId} />
      ))}
    </section>
  );
}

/** Left navigation: pages, the 24 compositions and the 19 component snippets (PG-01, PG-02). */
export function Sidebar({ pathname }: { pathname: string }) {
  const selectedId = useWorkspace((state) => state.selectedId);
  const resetAll = () => {
    localStorage.removeItem("agentic-ui-playground");
    useWorkspace.getState().resetAll();
    useSession.getState().clearEvents();
    navigate("/");
  };
  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r bg-sidebar">
      <div className="flex h-12 items-center gap-2.5 border-b px-4">
        <div className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-brand to-violet-500 font-bold text-[11px] text-brand-foreground">
          A
        </div>
        <span className="font-semibold text-[13px] tracking-tight">agentic-ui</span>
        <Badge variant="outline" className="ml-auto font-mono text-[10.5px] text-muted-foreground">
          ui-kit-one
        </Badge>
      </div>
      <nav aria-label="Pages" className="flex flex-col gap-0.5 p-2">
        {PAGES.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-white/[0.07] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <IntegrationNav pathname={pathname} />
      <ScrollArea className="min-h-0 flex-1 border-t">
        <div className="px-2 pb-4">
          <Section title="Compositions" examples={compositions} selectedId={selectedId} />
          <Section title="Components" examples={componentExamples} selectedId={selectedId} />
        </div>
      </ScrollArea>
      <div className="flex items-center justify-between border-t px-3 py-2.5">
        <span className="text-[11px] text-muted-foreground">A2UI v0.9 · Chakra UI v1</span>
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={resetAll}>
          <RotateCcw />
          Reset all
        </Button>
      </div>
    </aside>
  );
}
