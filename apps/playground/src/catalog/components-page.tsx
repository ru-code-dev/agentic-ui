import { TWO_WAY_BINDINGS } from "@agentic-ui/ui-kit-one-catalog";
import { PASSTHROUGH } from "@agentic-ui/ui-kit-one-react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "../app/router.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { componentExamples } from "../examples.ts";
import { SnippetPreview } from "./snippet-preview.tsx";

/** `/components`: the 19 components as cards with live inline previews (PG-20). */
export function ComponentsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-xl tracking-tight">Components</h1>
          <p className="text-[13px] text-muted-foreground">
            The ui-kit-one contract: {componentExamples.length} components rendered live with Chakra
            UI v1 in a scoped kit root.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {componentExamples.map((example) => (
            <article
              key={example.id}
              className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-white/15"
              data-testid={`card-${example.name}`}
            >
              <div className="relative h-44 overflow-hidden bg-(--kit-page-bg)">
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-4 [&_[data-ui-kit-root]]:max-w-full">
                  <SnippetPreview messages={example.messages} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-(--kit-page-bg) to-transparent" />
              </div>
              <Link
                to={`/components/${example.name}`}
                className="flex items-start gap-3 border-t px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-[13.5px]">{example.name}</h2>
                    <Badge variant="outline" className="text-muted-foreground">
                      {example.name in PASSTHROUGH ? "passthrough" : "custom"}
                    </Badge>
                    {(TWO_WAY_BINDINGS[example.name] ?? []).length > 0 && (
                      <Badge variant="info">two-way</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
                    {example.description}
                  </p>
                </div>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
