import type { PromptSection } from "@agentic-ui/ui-kit-one-catalog/prompt";
import { cn } from "../lib/utils.ts";
import { formatDelta, formatTokens, SECTION_COLORS } from "./section-colors.ts";

export interface MeasuredSection extends PromptSection {
  readonly tokens: number;
  readonly baseline: number;
}

/** Token share of each prompt section: stacked bar and table with delta vs default (PG-26 a). */
export function SectionsCard({
  sections,
  total,
}: {
  sections: readonly MeasuredSection[];
  total: number;
}) {
  return (
    <section
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      aria-label="Prompt sections"
      data-testid="sections-card"
    >
      <h2 className="font-medium text-[13px]">System prompt sections</h2>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.04]"
        role="img"
        aria-label="Token share per section"
      >
        {sections.map((section) => (
          <div
            key={section.id}
            style={{
              width: `${(section.tokens / Math.max(total, 1)) * 100}%`,
              backgroundColor: SECTION_COLORS[section.id],
            }}
            title={`${section.title}: ${formatTokens(section.tokens)}`}
          />
        ))}
      </div>
      <table className="w-full text-[12.5px]">
        <thead className="text-[11px] text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="pb-2 text-left font-medium">Section</th>
            <th className="pb-2 text-right font-medium">Tokens</th>
            <th className="pb-2 text-right font-medium">Share</th>
            <th className="pb-2 text-right font-medium">vs default</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => {
            const delta = section.tokens - section.baseline;
            return (
              <tr key={section.id} className="border-t" data-testid={`section-${section.id}`}>
                <td className="py-1.5">
                  <a
                    href={`#prompt-${section.id}`}
                    className="inline-flex items-center gap-2 hover:text-foreground"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: SECTION_COLORS[section.id] }}
                    />
                    {section.title}
                  </a>
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {formatTokens(section.tokens)}
                </td>
                <td className="py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                  {((section.tokens / Math.max(total, 1)) * 100).toFixed(1)}%
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right font-mono tabular-nums",
                    delta < 0
                      ? "text-success-foreground"
                      : delta > 0
                        ? "text-warning-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {formatDelta(delta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
