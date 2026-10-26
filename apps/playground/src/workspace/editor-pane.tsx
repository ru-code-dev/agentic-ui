import { RotateCcw, WandSparkles } from "lucide-react";
import { HighlightedCode } from "../code/highlight.tsx";
import { CopyButton } from "../components/copy-button.tsx";
import { IconButton } from "../components/icon-button.tsx";
import { PaneHeader } from "../components/pane-header.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/ui/tabs.tsx";
import { messagesToJsx } from "../editor/jsx/to-jsx.ts";
import { JsonEditor } from "../editor/json-editor.tsx";
import { findExample } from "../examples.ts";
import { useSession } from "../state/session-store.ts";
import { useWorkspace } from "../state/workspace-store.ts";
import type { Analysis } from "./use-analysis.ts";

const FORMAT_LABEL = {
  array: "Message array",
  jsonl: "JSONL",
  message: "Single message",
  example: "Example file",
  wrapper: "{ messages }",
} as const;

interface EditorPaneProps {
  readonly analysis: Analysis;
  readonly onFormat: () => void;
  readonly onForceRender: () => void;
}

function Status({ analysis }: { analysis: Analysis }) {
  if (!analysis.parse.ok)
    return (
      <Badge variant="error" data-testid="editor-status">
        Invalid JSON · line {analysis.parse.error.line}
      </Badge>
    );
  if (analysis.issue !== undefined)
    return (
      <Badge variant="warning" data-testid="editor-status">
        Schema error · line {analysis.issue.line}
      </Badge>
    );
  return (
    <Badge variant="success" data-testid="editor-status">
      Valid
    </Badge>
  );
}

/** Center pane: JSON editor, generated JSX and data model of the selected example (PG-03, PG-21). */
export function EditorPane({ analysis, onFormat, onForceRender }: EditorPaneProps) {
  const { source, selectedId, setSource, resetToSelected } = useWorkspace();
  const dataModels = useSession((state) => state.dataModels);
  const example = findExample(selectedId);
  const messages = analysis.parse.ok ? analysis.parse.messages : [];
  return (
    <div className="flex h-full min-w-0 flex-col bg-panel">
      <Tabs defaultValue="json" className="flex h-full min-h-0 flex-col gap-0">
        <PaneHeader
          actions={
            <>
              <IconButton label="Format" shortcut="⌘S" onClick={onFormat}>
                <WandSparkles />
              </IconButton>
              <CopyButton text={source} label="Copy JSON" />
              <IconButton label="Reset to example" onClick={resetToSelected}>
                <RotateCcw />
              </IconButton>
            </>
          }
        >
          <TabsList variant="underline" className="-mb-px h-10 py-0">
            <TabsTab value="json">JSON</TabsTab>
            <TabsTab value="jsx">JSX</TabsTab>
            <TabsTab value="data">Data model</TabsTab>
          </TabsList>
          <span className="mx-1 h-4 w-px bg-border" />
          <Status analysis={analysis} />
          {analysis.parse.ok ? (
            <span
              className="hidden truncate text-[11.5px] text-muted-foreground 2xl:inline"
              title={example?.name}
            >
              {FORMAT_LABEL[analysis.parse.format]}
            </span>
          ) : null}
        </PaneHeader>
        <TabsPanel value="json" className="min-h-0 flex-1">
          <JsonEditor
            value={source}
            onChange={setSource}
            onFormat={onFormat}
            onForceRender={onForceRender}
          />
        </TabsPanel>
        <TabsPanel value="jsx" className="min-h-0 flex-1 overflow-auto" data-testid="jsx-view">
          <HighlightedCode code={messagesToJsx(messages)} lang="tsx" />
        </TabsPanel>
        <TabsPanel
          value="data"
          className="min-h-0 flex-1 overflow-auto"
          data-testid="editor-data-model"
        >
          <HighlightedCode code={JSON.stringify(dataModels, null, 2)} lang="json" />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
