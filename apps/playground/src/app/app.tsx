import "../index.css";
import { lazy, Suspense } from "react";
import { Spinner } from "../components/ui/spinner.tsx";
import { TooltipProvider } from "../components/ui/tooltip.tsx";
import { RenderBoundary } from "../preview/render-boundary.tsx";
import { WorkspacePage } from "../workspace/workspace-page.tsx";
import { backdropStyle } from "./backdrop.ts";
import { usePathname } from "./router.tsx";
import { Sidebar } from "./sidebar.tsx";

// Secondary routes load on first visit; the workspace ships in the entry chunk.
const ComponentsPage = lazy(async () => ({
  default: (await import("../catalog/components-page.tsx")).ComponentsPage,
}));
const ComponentDetailPage = lazy(async () => ({
  default: (await import("../catalog/component-detail-page.tsx")).ComponentDetailPage,
}));
const AgentPage = lazy(async () => ({
  default: (await import("../agent/agent-page.tsx")).AgentPage,
}));
const IntegrationPage = lazy(async () => ({
  default: (await import("../integration/integration-page.tsx")).IntegrationPage,
}));
const LlmContextPage = lazy(async () => ({
  default: (await import("../llm/llm-context-page.tsx")).LlmContextPage,
}));

const RouteFallback = () => (
  <div className="grid flex-1 place-items-center" aria-busy="true">
    <Spinner className="size-5 text-muted-foreground" />
  </div>
);

const RouteFailed = (message: string) => (
  <div className="grid flex-1 place-items-center p-6" role="alert" data-testid="route-failed">
    <div className="flex max-w-xl flex-col gap-2 text-[13px]">
      <p className="font-medium">Страница упала при отрисовке</p>
      <p className="font-mono text-[12px] text-muted-foreground">{message}</p>
      <p className="text-muted-foreground">Откройте другую страницу слева или перезагрузите эту.</p>
    </div>
  </div>
);

function Route({ pathname }: { pathname: string }) {
  if (pathname === "/components") return <ComponentsPage />;
  const detail = /^\/components\/([A-Za-z]+)$/.exec(pathname);
  if (detail !== null) return <ComponentDetailPage name={detail[1] as string} />;
  if (pathname === "/llm-context") return <LlmContextPage />;
  if (pathname === "/agent") return <AgentPage />;
  const integration = /^\/integration(?:\/([a-z-]+))?$/.exec(pathname);
  if (integration !== null) return <IntegrationPage slug={integration[1] ?? "full-chat"} />;
  return <WorkspacePage />;
}

/** The playground shell (Tailwind): sidebar + routed page (PG-25). `/preview` never loads it. */
export function App() {
  const pathname = usePathname();
  return (
    <TooltipProvider delay={400}>
      <div
        className="flex h-screen overflow-hidden bg-background text-foreground"
        style={backdropStyle}
      >
        <Sidebar pathname={pathname} />
        <main className="flex min-w-0 flex-1 flex-col">
          {/* A3-13: a page that throws leaves a placeholder next to the sidebar, never a white page. */}
          <RenderBoundary
            key={pathname}
            onError={(message) => console.error(message)}
            fallback={RouteFailed}
          >
            <Suspense fallback={<RouteFallback />}>
              <Route pathname={pathname} />
            </Suspense>
          </RenderBoundary>
        </main>
      </div>
    </TooltipProvider>
  );
}
