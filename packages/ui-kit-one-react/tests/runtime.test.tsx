import type { A2uiClientAction, A2uiMessage } from "@a2ui/web_core/v0_9";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import {
  createUiKitRuntime,
  LocalTransport,
  UiKitProvider,
  UiKitSurface,
  useSurfaces,
  type Transport,
  type UiKitRuntime,
} from "../src/index.ts";
import { components, data, surface } from "./support/messages.ts";

/** A network-like transport: everything crosses the wire as JSON text, like a WebSocket would. */
class FakeSocketTransport implements Transport {
  readonly sent: string[] = [];
  private listener: ((messages: readonly A2uiMessage[]) => void) | undefined;
  onMessages(listener: (messages: readonly A2uiMessage[]) => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  sendAction(action: A2uiClientAction, dataModel?: unknown) {
    this.sent.push(JSON.stringify({ action, dataModel }));
  }
  receive(frame: string) {
    this.listener?.(JSON.parse(frame) as A2uiMessage[]);
  }
}

function Surfaces({ runtime }: { runtime: UiKitRuntime }) {
  const surfaces = useSurfaces(runtime);
  return (
    <UiKitProvider>
      {surfaces.map((item) => (
        <UiKitSurface key={item.id} surface={item} />
      ))}
    </UiKitProvider>
  );
}

describe("runtime and transport seam", () => {
  it("renders and reports actions over a network-style transport with no renderer changes", async () => {
    const transport = new FakeSocketTransport();
    const runtime = createUiKitRuntime({ transport });
    render(<Surfaces runtime={runtime} />);
    act(() =>
      transport.receive(
        JSON.stringify([
          surface("net", true),
          data("net", "/user", "Анна"),
          components("net", [
            {
              id: "root",
              component: "Button",
              label: "Привет",
              action: { event: { name: "greet", context: { who: { path: "/user" } } } },
            },
          ]),
        ]),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Привет" }));
    expect(JSON.parse(transport.sent[0] ?? "{}")).toMatchObject({
      action: { name: "greet", surfaceId: "net", context: { who: "Анна" } },
      dataModel: { user: "Анна" },
    });
  });

  it("reports invalid messages to error listeners instead of throwing", () => {
    const transport = new LocalTransport();
    const runtime = createUiKitRuntime({ transport });
    const errors: string[] = [];
    runtime.onError((error) => errors.push(error.message));
    transport.push([
      surface("bad"),
      components("bad", [{ id: "root", component: "Slider" }]),
    ] as unknown as A2uiMessage[]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Slider");
  });

  it("stops delivering messages after dispose and lists surfaces as they come and go", () => {
    const transport = new LocalTransport();
    const runtime = createUiKitRuntime({ transport });
    transport.push([surface("a")] as unknown as A2uiMessage[]);
    expect([...runtime.processor.getSurfaces().keys()]).toEqual(["a"]);
    runtime.dispose();
    transport.push([surface("b")] as unknown as A2uiMessage[]);
    expect(runtime.processor.getSurfaces().has("b")).toBe(false);
  });
});
