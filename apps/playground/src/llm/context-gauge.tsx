import { formatTokens } from "./section-colors.ts";

export const WINDOWS = [32_000, 128_000, 200_000, 1_000_000] as const;
const label = (size: number) => (size >= 1_000_000 ? `${size / 1_000_000}M` : `${size / 1000}k`);

/** System prompt + one turn against the selected context window (PG-26 f). */
export function ContextGauge({
  prompt,
  turn,
  contextWindow,
}: {
  prompt: number;
  turn: number;
  contextWindow: number;
}) {
  const used = prompt + turn;
  const share = (value: number) => `${Math.min(100, (value / contextWindow) * 100)}%`;
  const percent = (used / contextWindow) * 100;
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border bg-card p-5"
      aria-label="Context window"
      data-testid="context-gauge"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-[13px]">Context window</h2>
        <span className="font-mono text-[12px] text-muted-foreground">
          {formatTokens(used)} / {label(contextWindow)} · {percent.toFixed(1)}%
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="bg-brand" style={{ width: share(prompt) }} />
        <div className="bg-success" style={{ width: share(turn) }} />
      </div>
      <div className="flex gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand" />
          System prompt {formatTokens(prompt)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" />
          Turn payloads {formatTokens(turn)}
        </span>
        <span className="ml-auto">
          {formatTokens(Math.max(0, contextWindow - used))} left for the conversation
        </span>
      </div>
    </section>
  );
}
