import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { createA2UIChat } from "../src/core/index.ts";
import {
  A2UIKitProvider,
  A2UISurface,
  useA2UIChat,
  useA2UISurfaces,
  type SurfaceAction,
} from "../src/react/index.ts";
import { scriptedFetch, surface } from "./support/scripted.ts";

/**
 * The same surface id in both chats; in `broken` an Avatar name is bound to a number (it fails to render; a label bound
 * to an object never reaches the renderer since the page store runs the project rules, A5-01).
 */
const failing = () => {
  const messages = surface("s1", "x");
  (
    messages[1] as { updateComponents: { components: Record<string, unknown>[] } }
  ).updateComponents.components[2] = {
    id: "b",
    component: "Avatar",
    name: { path: "/n" },
  };
  return messages;
};

function Surfaces({ name, onError }: { name: string; onError: (message: string) => void }) {
  const { surfaces, apply } = useA2UISurfaces({ onError });
  return (
    <section aria-label={name}>
      <button
        type="button"
        onClick={() => apply(name === "broken" ? failing() : surface("s1", "Цел"))}
      >
        {`apply ${name}`}
      </button>
      <A2UIKitProvider mode="scoped">
        {surfaces.map((s) => (
          <A2UISurface key={s.id} surface={s} onError={onError} />
        ))}
      </A2UIKitProvider>
    </section>
  );
}

describe("render errors are scoped per chat (PKG-A-O2) [SV-C26]", () => {
  it("[SV-C26] two chats on one page with the same surface and component ids: only the failing one hears its error", async () => {
    const broken = vi.fn<(message: string) => void>();
    const healthy = vi.fn<(message: string) => void>();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <>
        <Surfaces name="healthy" onError={healthy} />
        <Surfaces name="broken" onError={broken} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "apply healthy" }));
    fireEvent.click(screen.getByRole("button", { name: "apply broken" }));
    expect(await screen.findByText("Цел")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId("component-failed")).toHaveLength(1));
    quiet.mockRestore();
    expect(broken.mock.calls.flat().join(" ")).toContain("Avatar «b»");
    expect(healthy).not.toHaveBeenCalled();
  });
});

function Owned({ onAction }: { onAction: (action: SurfaceAction, sent: boolean) => void }) {
  const chat = useA2UIChat({ chat: owned, onAction });
  return (
    <A2UIKitProvider mode="scoped">
      {chat.surfaces.map((s) => (
        <A2UISurface key={s.id} surface={s} />
      ))}
    </A2UIKitProvider>
  );
}
let owned = createA2UIChat();

describe("useA2UIChat with a host-owned chat and observers [SV-C26]", () => {
  it("[SV-C26] the host's chat outlives the component; onAction sees every action with whether it was sent", async () => {
    const { fetch, seen } = scriptedFetch([{ messages: surface("s1", "Раз") }, { text: "ok" }]);
    owned = createA2UIChat({ endpoint: "/api", fetch });
    await owned.send("покажи");
    const onAction = vi.fn<(action: SurfaceAction, sent: boolean) => void>();
    const first = render(<Owned onAction={onAction} />);
    expect(await screen.findByText("Раз")).toBeTruthy();
    first.unmount();
    render(<Owned onAction={onAction} />); // remount: the same chat, its surfaces replayed
    fireEvent.click(await screen.findByRole("button", { name: "Go" }));
    await waitFor(() => expect(owned.getState().turns).toHaveLength(2));
    await act(() => vi.waitFor(() => expect(owned.busy()).toBe(false)));
    expect(onAction.mock.calls.map(([action, sent]) => [action.name, sent])).toEqual([
      ["go", true],
    ]);
    expect(seen.filter((s) => s.path === "action")).toHaveLength(1);
    expect(owned.getState().turns[1]?.result?.text).toBe("ok");
  });
});
