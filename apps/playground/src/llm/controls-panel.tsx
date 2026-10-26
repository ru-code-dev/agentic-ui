import type { PromptFormat } from "@agentic-ui/ui-kit-one-catalog/prompt";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "../components/icon-button.tsx";
import { Button } from "../components/ui/button.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group.tsx";
import { compositions } from "../examples.ts";
import { cn } from "../lib/utils.ts";
import { formatDelta, formatTokens } from "./section-colors.ts";
import { DEFAULT_CONTROLS, type LlmControls } from "./use-llm-context.ts";

const FORMAT_ITEM =
  "h-7 rounded-md text-[12.5px] text-muted-foreground hover:text-foreground data-pressed:bg-white/10 data-pressed:text-foreground data-pressed:shadow-sm";

interface ControlsPanelProps {
  readonly controls: LlmControls;
  readonly onChange: (controls: LlmControls) => void;
  readonly allComponents: readonly string[];
  readonly total: number | undefined;
  readonly baselineTotal: number | undefined;
}

/** Live prompt controls with the total delta vs the default prompt (PG-26 c). */
export function ControlsPanel({
  controls,
  onChange,
  allComponents,
  total,
  baselineTotal,
}: ControlsPanelProps) {
  const set = (patch: Partial<LlmControls>) => onChange({ ...controls, ...patch });
  const toggle = (name: string, checked: boolean) =>
    set({
      components: allComponents.filter((candidate) =>
        candidate === name ? checked : controls.components.includes(candidate),
      ),
    });
  const delta =
    total === undefined || baselineTotal === undefined ? undefined : total - baselineTotal;
  return (
    <aside
      className="flex flex-col gap-5 rounded-xl border bg-card p-5"
      aria-label="Prompt controls"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-[13px]">Controls</h2>
        {delta === undefined ? null : (
          <span
            className={cn(
              "font-mono text-[12px]",
              delta < 0
                ? "text-success-foreground"
                : delta > 0
                  ? "text-warning-foreground"
                  : "text-muted-foreground",
            )}
            data-testid="total-delta"
          >
            {formatDelta(delta)} vs default
          </span>
        )}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[12px] text-muted-foreground">Format</legend>
        <ToggleGroup
          value={[controls.format]}
          onValueChange={(value) =>
            value[0] !== undefined && set({ format: value[0] as PromptFormat })
          }
          size="sm"
          className="grid w-full grid-cols-2 gap-0.5 rounded-lg border bg-white/[0.03] p-0.5"
        >
          <ToggleGroupItem value="direct-json" className={FORMAT_ITEM}>
            Direct JSON
          </ToggleGroupItem>
          <ToggleGroupItem value="express" className={FORMAT_ITEM}>
            Express
          </ToggleGroupItem>
        </ToggleGroup>
      </fieldset>
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">Few-shot examples</span>
        <div className="flex items-center rounded-md border">
          <IconButton
            label="Fewer examples"
            onClick={() => set({ examples: Math.max(0, controls.examples - 1) })}
          >
            <Minus />
          </IconButton>
          <span
            className="w-7 text-center font-mono text-[13px] tabular-nums"
            data-testid="llm-examples"
          >
            {controls.examples}
          </span>
          <IconButton
            label="More examples"
            onClick={() => set({ examples: Math.min(compositions.length, controls.examples + 1) })}
          >
            <Plus />
          </IconButton>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-[12px] text-muted-foreground">
            Components ({controls.components.length}/{allComponents.length})
          </legend>
          <div className="flex gap-1">
            <Button size="xs" variant="ghost" onClick={() => set({ components: allComponents })}>
              All
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                set({
                  components: allComponents.filter((name) =>
                    ["Container", "Flex", "Text"].includes(name),
                  ),
                })
              }
            >
              Minimal
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {allComponents.map((name) => (
            <label key={name} className="flex items-center gap-2 font-mono text-[12px]">
              <Checkbox
                checked={controls.components.includes(name)}
                onCheckedChange={(checked) => toggle(name, checked === true)}
                aria-label={name}
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-2">
        <span className="text-[12px] text-muted-foreground">Custom instructions</span>
        <Textarea
          className="h-24 text-[12.5px]"
          placeholder="Ты — ассистент интернет-банка. Отвечай кратко…"
          value={controls.instructions}
          onChange={(event) => set({ instructions: event.target.value })}
          data-testid="llm-instructions"
        />
      </label>
      <Button size="sm" variant="outline" onClick={() => onChange(DEFAULT_CONTROLS)}>
        Reset to default
      </Button>
      {total === undefined ? null : (
        <p className="text-[11.5px] text-muted-foreground">
          Default: all components, {DEFAULT_CONTROLS.examples} examples, Direct JSON, no
          instructions ({formatTokens(baselineTotal ?? 0)} tokens).
        </p>
      )}
    </aside>
  );
}
