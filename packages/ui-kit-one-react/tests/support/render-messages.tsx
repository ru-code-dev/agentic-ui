import type { A2uiMessage } from "@a2ui/web_core/v0_9";
import { act, render } from "@testing-library/react";
import {
  createUiKitRuntime,
  LocalTransport,
  UiKitProvider,
  UiKitSurface,
  useSurfaces,
  type SentAction,
  type UiKitProviderProps,
  type UiKitRuntime,
  type UiKitRuntimeOptions,
} from "../../src/index.ts";

function Surfaces({ runtime, mode }: { runtime: UiKitRuntime; mode: UiKitProviderProps["mode"] }) {
  const surfaces = useSurfaces(runtime);
  return (
    <UiKitProvider {...(mode === undefined ? {} : { mode })}>
      {surfaces.map((surface) => (
        <UiKitSurface key={surface.id} surface={surface} />
      ))}
    </UiKitProvider>
  );
}

/** Renders A2UI messages through the real runtime, transport and provider. */
export function renderMessages(
  messages: readonly unknown[],
  options: { mode?: UiKitProviderProps["mode"]; catalog?: UiKitRuntimeOptions["catalog"] } = {},
) {
  const transport = new LocalTransport();
  const runtime = createUiKitRuntime({
    transport,
    ...(options.catalog === undefined ? {} : { catalog: options.catalog }),
  });
  const sent: SentAction[] = [];
  transport.onAction((action) => sent.push(action));
  const view = render(<Surfaces runtime={runtime} mode={options.mode} />);
  const push = (next: readonly unknown[]) =>
    act(() => transport.push(next as readonly A2uiMessage[]));
  push(messages);
  const dataModel = (surfaceId: string, path = "/") =>
    runtime.processor.getSurface(surfaceId)?.dataModel.get(path);
  return { view, runtime, sent, push, dataModel };
}
