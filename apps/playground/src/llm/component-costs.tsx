import { ArrowDownWideNarrow, ArrowUpAZ } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button.tsx";
import { formatTokens } from "./section-colors.ts";

/** Tokens of each component's catalog schema entry, sortable (PG-26 b). */
export function ComponentCosts({
  components,
}: {
  components: ReadonlyArray<{ name: string; tokens: number }>;
}) {
  const [sort, setSort] = useState<"tokens" | "name">("tokens");
  const rows = [...components].toSorted((a, b) =>
    sort === "tokens" ? b.tokens - a.tokens : a.name.localeCompare(b.name),
  );
  const max = Math.max(1, ...components.map((component) => component.tokens));
  const total = components.reduce((sum, component) => sum + component.tokens, 0);
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border bg-card p-5"
      aria-label="Component costs"
      data-testid="component-costs"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-[13px]">Cost per component</h2>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setSort(sort === "tokens" ? "name" : "tokens")}
          data-testid="sort-components"
        >
          {sort === "tokens" ? <ArrowDownWideNarrow /> : <ArrowUpAZ />}
          {sort === "tokens" ? "By tokens" : "By name"}
        </Button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row.name}
            className="grid grid-cols-[110px_1fr_64px] items-center gap-3 text-[12.5px]"
            data-testid="component-cost"
          >
            <span className="truncate font-mono">{row.name}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
              <span
                className="block h-full rounded-full bg-brand/70"
                style={{ width: `${(row.tokens / max) * 100}%` }}
              />
            </span>
            <span className="text-right font-mono text-muted-foreground tabular-nums">
              {formatTokens(row.tokens)}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t pt-2 text-right font-mono text-[12px] text-muted-foreground">
        Σ {formatTokens(total)} tokens in {components.length} schema entries
      </p>
    </section>
  );
}
