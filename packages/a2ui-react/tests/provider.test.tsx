import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  A2UIChat,
  A2UIKitProvider,
  A2UISurface,
  useA2UIChat,
  useA2UISurfaces,
} from "../src/react/index.ts";
import { scriptedFetch, surface } from "./support/scripted.ts";

function OwnKit({ children }: { readonly children: ReactNode }) {
  return (
    <div data-testid="own-kit">
      <A2UIKitProvider mode="scoped">{children}</A2UIKitProvider>
    </div>
  );
}

function Chat() {
  const chat = useA2UIChat({
    endpoint: "/api",
    fetch: scriptedFetch([{ messages: surface("s1", "A") }]).fetch,
  });
  return <A2UIChat chat={chat} provider={OwnKit} labels={{ send: "Go!" }} />;
}

function Watched({ onData }: { readonly onData: (value: unknown) => void }) {
  const { surfaces, apply } = useA2UISurfaces();
  useEffect(() => {
    apply(surface("s1", "A"));
  }, [apply]);
  const update = [
    { version: "v0.9", updateDataModel: { surfaceId: "s1", path: "/", value: { n: 2 } } },
  ];
  return (
    <>
      <button type="button" onClick={() => apply(update)}>
        update
      </button>
      <A2UIKitProvider mode="scoped">
        {surfaces.map((s) => (
          <A2UISurface key={s.id} surface={s} onDataModelChange={onData} />
        ))}
      </A2UIKitProvider>
    </>
  );
}

describe("kit provider passthrough and surface callbacks [SV-C26]", () => {
  it("[SV-C26] the chat renders its surfaces inside the host's own provider; labels override the defaults", async () => {
    render(<Chat />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Go!" }));
    await waitFor(() => expect(screen.getByTestId("own-kit").textContent).toContain("A"));
    expect(screen.getByTestId("own-kit").querySelector("[data-surface-id='s1']")).not.toBeNull();
  });

  it("[SV-C26] <A2UISurface onDataModelChange> reports the surface's data model as plain JSON", async () => {
    const onData = vi.fn<(value: unknown) => void>();
    render(<Watched onData={onData} />);
    await screen.findByText("A");
    fireEvent.click(screen.getByRole("button", { name: "update" }));
    await waitFor(() => expect(onData).toHaveBeenLastCalledWith({ n: 2 }));
  });
});
