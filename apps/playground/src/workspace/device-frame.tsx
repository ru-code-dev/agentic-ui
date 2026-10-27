import { useEffect, useRef, useState } from "react";
import { toUrlPath } from "../app/base-path.ts";
import { cn } from "../lib/utils.ts";
import type { DevicePreset } from "./devices.ts";

const CHROME = {
  phone: { pad: 10, radius: 46, top: 0 },
  tablet: { pad: 14, radius: 30, top: 0 },
  desktop: { pad: 0, radius: 12, top: 32 },
} as const;

interface DeviceFrameProps {
  readonly device: DevicePreset;
  readonly landscape: boolean;
  readonly fit: boolean;
}

/** The preview iframe inside subtle device chrome, rotated and scaled to fit the pane (PG-06, PG-07). */
export function DeviceFrame({ device, landscape, fit }: DeviceFrameProps) {
  const area = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (area.current === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined)
        setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(area.current);
    return () => observer.disconnect();
  }, []);

  const iframe = (
    // oxlint-disable-next-line react/iframe-missing-sandbox -- the preview is this app's own origin and must share its BroadcastChannel; a sandbox would need allow-scripts + allow-same-origin, which grants nothing
    <iframe
      title="Device preview"
      data-testid="device-frame"
      src={toUrlPath("/preview")}
      className="block size-full bg-[#1a202c]"
    />
  );

  if (device.kind === "fill") {
    return (
      <div ref={area} className="min-h-0 flex-1 p-3">
        <div className="size-full overflow-hidden rounded-lg border">{iframe}</div>
      </div>
    );
  }

  const chrome = CHROME[device.kind];
  const [width, height] = landscape ? [device.height, device.width] : [device.width, device.height];
  const outer = { width: width + chrome.pad * 2, height: height + chrome.pad * 2 + chrome.top };
  const scale =
    fit && available.width > 0
      ? Math.min(1, (available.width - 48) / outer.width, (available.height - 48) / outer.height)
      : 1;

  return (
    <div
      ref={area}
      className={cn("relative min-h-0 flex-1", fit ? "overflow-hidden" : "overflow-auto")}
    >
      <div
        className="grid min-h-full min-w-full place-items-center p-6"
        style={{ minWidth: fit ? undefined : outer.width + 48 }}
      >
        <div
          style={{ width: outer.width * scale, height: outer.height * scale }}
          data-testid="device-viewport"
          data-width={width}
          data-height={height}
        >
          <div
            className={cn(
              "relative origin-top-left overflow-hidden ring-1 ring-white/10",
              device.kind === "desktop"
                ? "bg-[#18181b]"
                : "bg-[#141417] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
            )}
            style={{
              width: outer.width,
              height: outer.height,
              padding: chrome.pad,
              paddingTop: chrome.pad + chrome.top,
              borderRadius: chrome.radius,
              transform: `scale(${scale})`,
              boxShadow: "0 24px 80px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.5)",
            }}
          >
            {device.kind === "desktop" ? (
              <div className="absolute inset-x-0 top-0 flex h-8 items-center gap-1.5 border-b border-white/5 px-3">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="mx-auto rounded-md bg-white/5 px-10 py-0.5 font-mono text-[10.5px] text-white/40">
                  /preview
                </span>
              </div>
            ) : null}
            {device.kind === "phone" && !landscape ? (
              <div className="pointer-events-none absolute left-1/2 top-[18px] z-10 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-black" />
            ) : null}
            <div
              className="size-full overflow-hidden bg-[#1a202c]"
              style={{ borderRadius: Math.max(0, chrome.radius - chrome.pad) }}
            >
              {iframe}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
