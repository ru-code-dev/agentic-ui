import { Braces, ExternalLink, Maximize, RefreshCw, RotateCw, TriangleAlert } from "lucide-react";
import { IconButton } from "../components/icon-button.tsx";
import { PaneHeader } from "../components/pane-header.tsx";
import { Badge } from "../components/ui/badge.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.tsx";
import { parseMessages } from "../editor/parse-messages.ts";
import { encodeMessagesHash } from "../preview/hash.ts";
import { useSession } from "../state/session-store.ts";
import { useWorkspace } from "../state/workspace-store.ts";
import { DeviceFrame } from "./device-frame.tsx";
import { DEVICES, findDevice } from "./devices.ts";
import { EmptyHint } from "./panels/empty-hint.tsx";
import type { Analysis } from "./use-analysis.ts";

interface PreviewPaneProps {
  readonly analysis: Analysis;
  readonly onForceRender: () => void;
}

const sizeLabel = (width: number, height: number) => (width === 0 ? "Fill" : `${width}×${height}`);

/** Right pane: device preview of `/preview` with presets, rotation and zoom-to-fit (PG-05..07, PG-23). */
export function PreviewPane({ analysis, onForceRender }: PreviewPaneProps) {
  const { deviceId, landscape, fitToPane, setDevice, toggleLandscape, toggleFit } = useWorkspace();
  const errorCount = useSession((state) => state.previewErrors.length);
  const hasRendered = useSession((state) => state.revision > 0);
  const device = findDevice(deviceId);
  // The hash carries the editor content as it is now, not the debounced analysis.
  const openInNewTab = async () => {
    const current = parseMessages(useWorkspace.getState().source);
    const messages = current.ok
      ? current.messages
      : analysis.parse.ok
        ? analysis.parse.messages
        : [];
    window.open(`/preview#${await encodeMessagesHash(messages)}`, "_blank");
  };
  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <PaneHeader
        actions={
          <>
            <IconButton label="Rotate" onClick={toggleLandscape} pressed={landscape}>
              <RotateCw />
            </IconButton>
            <IconButton label="Zoom to fit" onClick={toggleFit} pressed={fitToPane}>
              <Maximize />
            </IconButton>
            <IconButton label="Re-render" shortcut="⌘↵" onClick={onForceRender}>
              <RefreshCw />
            </IconButton>
            <IconButton label="Open in new tab" onClick={() => void openInNewTab()}>
              <ExternalLink />
            </IconButton>
          </>
        }
      >
        <Select value={device.id} onValueChange={(value) => setDevice(String(value))}>
          <SelectTrigger size="sm" className="h-7 w-auto min-w-44 text-[13px]" aria-label="Device">
            <SelectValue>{(value: string) => findDevice(value).label}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {DEVICES.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                <span className="flex w-full items-center justify-between gap-6">
                  {preset.label}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {sizeLabel(preset.width, preset.height)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <span className="font-mono text-[11px] text-muted-foreground" data-testid="device-size">
          {landscape && device.kind !== "fill"
            ? sizeLabel(device.height, device.width)
            : sizeLabel(device.width, device.height)}
        </span>
        {analysis.parse.ok ? null : (
          <Badge variant="warning" data-testid="stale-preview">
            <TriangleAlert />
            {hasRendered ? "Showing last valid render" : "Nothing to render yet"}
          </Badge>
        )}
        {errorCount > 0 ? (
          <Badge variant="error">
            {errorCount} preview {errorCount === 1 ? "error" : "errors"}
          </Badge>
        ) : null}
      </PaneHeader>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DeviceFrame
          device={device}
          landscape={landscape && device.kind !== "fill"}
          fit={fitToPane}
        />
        {analysis.parse.ok || hasRendered ? null : (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm">
            <EmptyHint
              icon={Braces}
              title="The JSON does not parse"
              hint="Fix the error shown in the editor, or reset to the selected example, to render the preview."
            />
          </div>
        )}
      </div>
    </div>
  );
}
