import { useEffect } from "react";
import { Group, Panel } from "react-resizable-panels";
import { useWorkspace } from "../state/workspace-store.ts";
import { BottomPanel } from "./bottom-panel.tsx";
import { EditorPane } from "./editor-pane.tsx";
import { formatSource } from "./format-source.ts";
import { PreviewPane } from "./preview-pane.tsx";
import { ResizeHandle } from "./resize-handle.tsx";
import { useAnalysis } from "./use-analysis.ts";
import { usePreviewSync } from "./use-preview-sync.ts";

/** `/`: JSON editor | device preview, bottom panel with tabs (PG-03..PG-17). */
export function WorkspacePage() {
  const source = useWorkspace((state) => state.source);
  const analysis = useAnalysis(source);
  const sync = usePreviewSync(analysis.parse.ok ? analysis.parse.messages : undefined);
  const format = () =>
    useWorkspace.getState().setSource(formatSource(useWorkspace.getState().source));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "s") {
        event.preventDefault();
        format();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        sync.forceRender();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Group orientation="vertical" className="min-h-0 flex-1">
      <Panel defaultSize="66" minSize="30">
        <Group orientation="horizontal">
          <Panel defaultSize="46" minSize="24">
            <EditorPane analysis={analysis} onFormat={format} onForceRender={sync.forceRender} />
          </Panel>
          <ResizeHandle orientation="horizontal" />
          <Panel minSize="24">
            <PreviewPane analysis={analysis} onForceRender={sync.forceRender} />
          </Panel>
        </Group>
      </Panel>
      <ResizeHandle orientation="vertical" />
      <Panel defaultSize="34" minSize="12">
        <BottomPanel analysis={analysis} onApplyDataModel={sync.applyDataModel} />
      </Panel>
    </Group>
  );
}
