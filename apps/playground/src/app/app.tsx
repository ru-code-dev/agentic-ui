import "../index.css";
import { lazy, Suspense } from "react";
import { Spinner } from "../components/ui/spinner.tsx";
import { TooltipProvider } from "../components/ui/tooltip.tsx";
import { WorkspacePage } from "../workspace/workspace-page.tsx";
import { usePathname } from "./router.tsx";
import { Sidebar } from "./sidebar.tsx";

// Secondary routes load on first visit; the workspace ships in the entry chunk.
const ComponentsPage = lazy(async () => ({
  default: (await import("../catalog/components-page.tsx")).ComponentsPage,
}));
const ComponentDetailPage = lazy(async () => ({
  default: (await import("../catalog/component-detail-page.tsx")).ComponentDetailPage,
}));
const LlmContextPage = lazy(async () => ({
  default: (await import("../llm/llm-context-page.tsx")).LlmContextPage,
}));

const RouteFallback = () => (
  <div className="grid flex-1 place-items-center" aria-busy="true">
    <Spinner className="size-5 text-muted-foreground" />
  </div>
);

function Route({ pathname }: { pathname: string }) {
  if (pathname === "/components") return <ComponentsPage />;
  const detail = /^\/components\/([A-Za-z]+)$/.exec(pathname);
  if (detail !== null) return <ComponentDetailPage name={detail[1] as string} />;
  if (pathname === "/llm-context") return <LlmContextPage />;
  return <WorkspacePage />;
}

/** The playground shell (Tailwind): sidebar + routed page (PG-25). `/preview` never loads it. */
export function App() {
  const pathname = usePathname();
  return (
    <TooltipProvider delay={400}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar pathname={pathname} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<RouteFallback />}>
            <Route pathname={pathname} />
          </Suspense>
        </main>
      </div>
    </TooltipProvider>
  );
}
