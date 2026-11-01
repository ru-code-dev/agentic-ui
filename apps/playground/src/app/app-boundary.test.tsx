import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { RenderBoundary } from "../preview/render-boundary.tsx";

// The Agent page throws while rendering (A3-13: e.g. Intl RangeError from a kit component).
vi.mock("../agent/agent-page.tsx", () => ({
  AgentPage: () => {
    throw new RangeError("Incorrect locale information provided");
  },
}));

// jsdom has no Web Animations API; the sidebar's ScrollArea calls it on a timer.
Element.prototype.getAnimations ??= () => [];

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

function Thrower(): never {
  throw new Error("kit component failed");
}

describe("error boundaries: a render error never blanks the app [A3-13, DEC-054]", () => {
  it("a route that throws shows a placeholder with the error next to the sidebar", async () => {
    quiet();
    history.pushState(null, "", "/agent");
    const { App } = await import("./app.tsx");
    render(<App />);
    expect((await screen.findByTestId("route-failed")).textContent).toContain(
      "Incorrect locale information provided",
    );
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy();
    history.pushState(null, "", "/");
  });

  it("RenderBoundary reports the error and shows its fallback instead of the children", () => {
    quiet();
    const onError = vi.fn();
    render(
      <RenderBoundary
        onError={onError}
        fallback={(message) => <p data-testid="failed">{message}</p>}
      >
        <Thrower />
      </RenderBoundary>,
    );
    expect(screen.getByTestId("failed").textContent).toBe("kit component failed");
    expect(onError).toHaveBeenCalledWith("kit component failed");
  });
});
