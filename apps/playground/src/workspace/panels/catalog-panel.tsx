import { buildCatalogJson } from "@agentic-ui/ui-kit-one-catalog";
import { CodeBlock } from "../../code/code-block.tsx";

const CATALOG = JSON.stringify(buildCatalogJson(), null, 2);

/** The generated catalog.json (PG-13). */
export function CatalogPanel() {
  return <CodeBlock code={CATALOG} lang="json" title="catalog.json" filename="catalog.json" />;
}
