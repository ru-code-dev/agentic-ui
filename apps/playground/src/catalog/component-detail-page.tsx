import { COMPONENT_APIS, TWO_WAY_BINDINGS } from "@agentic-ui/ui-kit-one-catalog";
import { COMPONENT_MAPPINGS, PASSTHROUGH } from "@agentic-ui/ui-kit-one-react";
import { ChevronRight } from "lucide-react";
import { Link } from "../app/router.tsx";
import { CodeBlock } from "../code/code-block.tsx";
import { RichText } from "../components/rich-text.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/ui/tabs.tsx";
import { componentExamples } from "../examples.ts";
import { PropsTable } from "./props-table.tsx";
import { SnippetPreview } from "./snippet-preview.tsx";
import { contractSource, rendererSource, schemaEntry } from "./sources.ts";

/** `/components/:name`: live preview, props table and JSON / React / Contract / JSON Schema (PG-20). */
export function ComponentDetailPage({ name }: { name: string }) {
  const api = COMPONENT_APIS.find((candidate) => candidate.name === name);
  const example = componentExamples.find((candidate) => candidate.name === name);
  if (api === undefined || example === undefined) {
    return <p className="p-8 text-muted-foreground">Unknown component “{name}”.</p>;
  }
  const mapping = COMPONENT_MAPPINGS.find((candidate) => candidate.component === name);
  const renderer = rendererSource(name);
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-8">
        <nav
          className="flex h-5 items-center gap-1 text-[12.5px] leading-5 text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link to="/components" className="hover:text-foreground">
            Components
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{name}</span>
        </nav>
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl leading-8 tracking-tight">{name}</h1>
          <p className="max-w-3xl text-[13.5px] leading-6 text-muted-foreground">
            <RichText text={api.schema.description ?? ""} />
          </p>
          <div className="flex min-h-6 flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {name in PASSTHROUGH ? "passthrough" : "custom renderer"}
            </Badge>
            {mapping?.kit.map((kit) => (
              <Badge key={kit} variant="secondary" className="font-mono">
                {kit}
              </Badge>
            ))}
            {(TWO_WAY_BINDINGS[name] ?? []).map((prop) => (
              <Badge key={prop} variant="info">
                two-way {prop}
              </Badge>
            ))}
          </div>
        </header>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[530px_minmax(0,1fr)]">
          <section aria-label="Live preview" className="flex flex-col gap-2">
            <h2 className="font-medium text-[12px] leading-5 text-muted-foreground uppercase tracking-wider">
              Live preview
            </h2>
            <div className="min-h-64 overflow-hidden rounded-xl border bg-[#1a202c] p-6">
              <div className="w-[480px] max-w-full">
                <SnippetPreview messages={example.messages} testId={`scoped-${name}`} />
              </div>
            </div>
          </section>
          <section aria-label="Props" className="flex min-w-0 flex-col gap-2">
            <h2 className="font-medium text-[12px] leading-5 text-muted-foreground uppercase tracking-wider">
              Props
            </h2>
            <PropsTable name={name} />
          </section>
        </div>
        <Tabs defaultValue="json" className="gap-3">
          <TabsList>
            <TabsTab value="json">JSON</TabsTab>
            <TabsTab value="react">React</TabsTab>
            <TabsTab value="contract">Contract</TabsTab>
            <TabsTab value="schema">JSON Schema</TabsTab>
          </TabsList>
          <TabsPanel value="json" className="h-[520px]">
            <CodeBlock
              code={JSON.stringify(example.messages, null, 2)}
              lang="json"
              title={`examples/components/${name}.json`}
            />
          </TabsPanel>
          <TabsPanel value="react" className="h-[520px]">
            <CodeBlock code={renderer.code} lang="tsx" title={renderer.file} />
          </TabsPanel>
          <TabsPanel value="contract" className="h-[520px]">
            <CodeBlock
              code={contractSource(name)}
              lang="typescript"
              title={`ui-kit-one-catalog/src/components/${name.replaceAll(/(?<!^)([A-Z])/g, "-$1").toLowerCase()}.ts`}
            />
          </TabsPanel>
          <TabsPanel value="schema" className="h-[520px]">
            <CodeBlock
              code={schemaEntry(name)}
              lang="json"
              title={`catalog.json → components.${name}`}
            />
          </TabsPanel>
        </Tabs>
      </div>
    </div>
  );
}
