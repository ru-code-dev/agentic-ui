import { LoaderCircle } from "lucide-react";
import { Badge } from "../components/ui/badge.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.tsx";
import { ComponentCosts } from "./component-costs.tsx";
import { ContextGauge, WINDOWS } from "./context-gauge.tsx";
import { ControlsPanel } from "./controls-panel.tsx";
import { OutputCosts } from "./output-costs.tsx";
import { PromptViewer } from "./prompt-viewer.tsx";
import { formatTokens } from "./section-colors.ts";
import { SectionsCard } from "./sections-card.tsx";
import { TOKENIZERS, type TokenizerId } from "./tokenizers.ts";
import { TurnPayloads } from "./turn-payloads.tsx";
import { useLlmContext } from "./use-llm-context.ts";

const windowLabel = (size: number) => (size >= 1_000_000 ? "1M tokens" : `${size / 1000}k tokens`);

/** `/llm-context`: everything the model receives, measured in tokens (PG-26). */
export function LlmContextPage() {
  const context = useLlmContext();
  const tokenizer = TOKENIZERS.find((info) => info.id === context.tokenizer) ?? TOKENIZERS[0];
  const { measured } = context;
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-8 py-8">
        <header className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="font-semibold text-xl tracking-tight">LLM context</h1>
            <p className="text-[13px] text-muted-foreground">
              Everything the model receives for ui-kit-one, measured in tokens.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={context.tokenizer}
              onValueChange={(value) => context.setTokenizer(value as TokenizerId)}
            >
              <SelectTrigger size="sm" className="h-8 w-52 text-[13px]" aria-label="Tokenizer">
                <SelectValue>
                  {(value: string) => TOKENIZERS.find((info) => info.id === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {TOKENIZERS.map((info) => (
                  <SelectItem key={info.id} value={info.id}>
                    <span className="flex flex-col">
                      {info.label}
                      <span className="text-[11px] text-muted-foreground">{info.detail}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <Badge
              variant={tokenizer?.exact === true ? "success" : "warning"}
              data-testid="tokenizer-accuracy"
            >
              {tokenizer?.exact === true ? "exact" : "approximate"}
            </Badge>
            <Select
              value={context.contextWindow}
              onValueChange={(value) => context.setContextWindow(Number(value))}
            >
              <SelectTrigger size="sm" className="h-8 w-36 text-[13px]" aria-label="Context window">
                <SelectValue>{(value: number) => windowLabel(value)}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {WINDOWS.map((size) => (
                  <SelectItem key={size} value={size}>
                    {windowLabel(size)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        </header>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-0">
            <ControlsPanel
              controls={context.controls}
              onChange={context.setControls}
              allComponents={context.allComponents}
              total={measured?.total}
              baselineTotal={measured?.baselineTotal}
            />
          </div>
          {measured === undefined ? (
            <div
              className="flex h-64 items-center justify-center gap-2 rounded-xl border bg-card text-[13px] text-muted-foreground"
              data-testid="tokenizer-loading"
            >
              <LoaderCircle className="size-4 animate-spin" />
              Loading the {tokenizer?.label} tokenizer…
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-6">
              <div className="flex items-baseline gap-3" data-testid="prompt-total">
                <span className="font-semibold text-3xl tabular-nums tracking-tight">
                  {formatTokens(measured.total)}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  system prompt tokens · {tokenizer?.label}
                </span>
              </div>
              <ContextGauge
                prompt={measured.total}
                turn={measured.payloads.reduce((sum, payload) => sum + payload.tokens, 0)}
                contextWindow={context.contextWindow}
              />
              <SectionsCard sections={measured.sections} total={measured.total} />
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <ComponentCosts components={measured.components} />
                <OutputCosts outputs={measured.outputs} />
              </div>
              <TurnPayloads payloads={measured.payloads} />
              <PromptViewer text={context.prompt.text} sections={context.prompt.sections} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
