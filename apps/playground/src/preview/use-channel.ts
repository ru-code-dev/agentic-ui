import { useCallback, useEffect, useRef } from "react";
import { openPreviewChannel, type PreviewChannel, type PreviewChannelMessage } from "./channel.ts";

/** Opens the preview channel for the component's lifetime; returns a stable `post`. */
export function useChannel(
  onMessage: (message: PreviewChannelMessage) => void,
): (message: PreviewChannelMessage) => void {
  const channelRef = useRef<PreviewChannel | undefined>(undefined);
  const listenerRef = useRef(onMessage);
  listenerRef.current = onMessage;

  useEffect(() => {
    const channel = openPreviewChannel();
    channelRef.current = channel;
    const stop = channel.subscribe((message) => listenerRef.current(message));
    return () => {
      stop();
      channel.close();
      channelRef.current = undefined;
    };
  }, []);

  return useCallback((message: PreviewChannelMessage) => channelRef.current?.post(message), []);
}
