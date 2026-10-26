import { buildCatalogJson } from "@agentic-ui/ui-kit-one-catalog";
import { approxTokens, assembleSystemPrompt } from "@agentic-ui/ui-kit-one-catalog/prompt";
import { Minus, Plus } from "lucide-react";
import { useMemo } from "react";
import { CodeBlock } from "../../code/code-block.tsx";
import { IconButton } from "../../components/icon-button.tsx";
import { Link } from "../../app/router.tsx";
import { compositions } from "../../examples.ts";
import { useWorkspace } from "../../state/workspace-store.ts";

const CATALOG_JSON = buildCatalogJson();

/** The generated agent system prompt with an example-count control (PG-14). */
export function PromptPanel() {
  const count = useWorkspace((state) => state.promptExamples);
  const setCount = useWorkspace((state) => state.setPromptExamples);
  const prompt = useMemo(
    () => assembleSystemPrompt(CATALOG_JSON, { examples: compositions.slice(0, count) }),
    [count],
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-3 text-[12.5px]">
        <span className="text-muted-foreground">Few-shot examples</span>
        <div className="flex items-center rounded-md border">
          <IconButton label="Fewer examples" onClick={() => setCount(Math.max(0, count - 1))}>
            <Minus />
          </IconButton>
          <span className="w-6 text-center font-mono tabular-nums" data-testid="prompt-examples">
            {count}
          </span>
          <IconButton
            label="More examples"
            onClick={() => setCount(Math.min(compositions.length, count + 1))}
          >
            <Plus />
          </IconButton>
        </div>
        <span className="font-mono text-muted-foreground" data-testid="prompt-tokens">
          ≈ {approxTokens(prompt.text).toLocaleString("en-US")} tokens
        </span>
        <Link to="/llm-context" className="ml-auto text-brand hover:underline">
          Exact token breakdown →
        </Link>
      </div>
      <div className="min-h-0 flex-1">
        <CodeBlock
          wrap
          code={prompt.text}
          lang="markdown"
          title="system-prompt.md"
          filename="system-prompt.md"
        />
      </div>
    </div>
  );
}
