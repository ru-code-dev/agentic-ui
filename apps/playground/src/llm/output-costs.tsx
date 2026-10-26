import { formatTokens } from "./section-colors.ts";

/** Tokens the model writes to produce each composition in the selected format (PG-26 e). */
export function OutputCosts({
  outputs,
}: {
  outputs: ReadonlyArray<{ id: string; name: string; tokens: number }>;
}) {
  const total = outputs.reduce((sum, output) => sum + output.tokens, 0);
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border bg-card p-5"
      aria-label="Output costs"
      data-testid="output-costs"
    >
      <h2 className="font-medium text-[13px]">Output cost per composition</h2>
      <table className="w-full text-[12.5px]">
        <tbody>
          {outputs.map((output) => (
            <tr key={output.id} className="border-t first:border-t-0">
              <td className="py-1.5 font-mono text-[11.5px] text-muted-foreground">
                {output.id.slice(0, 2)}
              </td>
              <td className="py-1.5">{output.name}</td>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {formatTokens(output.tokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t pt-2 text-right font-mono text-[12px] text-muted-foreground">
        avg {formatTokens(Math.round(total / Math.max(outputs.length, 1)))} tokens per screen
      </p>
    </section>
  );
}
