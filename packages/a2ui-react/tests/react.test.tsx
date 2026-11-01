import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ApplyResult } from "../src/core/index.ts";
import {
  A2UIChat,
  A2UIKitProvider,
  A2UISurface,
  useA2UIChat,
  useA2UISurfaces,
  type Placement,
  type SurfaceAction,
} from "../src/react/index.ts";
import { retext, scriptedFetch, surface, type Outcome } from "./support/scripted.ts";

function Host({
  messages,
  onAction,
  onResult,
}: {
  messages: unknown[][];
  onAction: (a: SurfaceAction) => void;
  onResult: (r: ApplyResult) => void;
}) {
  const { surfaces, apply } = useA2UISurfaces({ onAction });
  return (
    <>
      <button type="button" onClick={() => messages.forEach((m) => onResult(apply(m)))}>
        apply
      </button>
      <A2UIKitProvider mode="scoped">
        {surfaces.map((s) => (
          <A2UISurface key={s.id} surface={s} />
        ))}
      </A2UIKitProvider>
    </>
  );
}

function Chat({
  replies,
  placement,
  interactive,
}: {
  replies: Outcome[];
  placement?: Placement;
  interactive?: "all" | "latest";
}) {
  const chat = useA2UIChat({ endpoint: "/api", fetch: scriptedFetch([...replies]).fetch });
  return (
    <A2UIChat
      chat={chat}
      {...(placement ? { placement } : {})}
      {...(interactive ? { interactive } : {})}
    />
  );
}

async function say(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
  await waitFor(() => expect(screen.queryByTestId("a2ui-working")).toBeNull());
}

const turns = () => screen.getAllByTestId("a2ui-turn");

describe("React layer [SV-C26]", () => {
  it("[SV-C26] useA2UISurfaces: apply merges-then-checks; a valid reply renders, an invalid one changes nothing; actions carry the data model", async () => {
    const onAction = vi.fn<(a: SurfaceAction) => void>();
    const onResult = vi.fn<(r: ApplyResult) => void>();
    render(
      <Host
        messages={[surface("s1", "Привет"), retext("nope", "x")]}
        onAction={onAction}
        onResult={onResult}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "apply" }));
    expect(await screen.findByText("Привет")).toBeTruthy();
    expect(onResult.mock.calls[0]?.[0]).toEqual({ valid: true, created: ["s1"], updated: [] });
    expect(onResult.mock.calls[1]?.[0]).toMatchObject({ valid: false });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0]?.[0]).toMatchObject({
      name: "go",
      surfaceId: "s1",
      dataModel: { n: 1 },
    });
  });

  it("[SV-C27] the default chat always shows the text: a text-only turn, text + failed UI placeholder, a rejected UI", async () => {
    render(
      <Chat
        replies={[
          { text: "Только текст." },
          { status: "fallback", text: "Не вышло." },
          { text: "Плохой UI.", messages: retext("x", "y") },
          { text: "Плохой снова.", messages: retext("x", "y") },
        ]}
      />,
    );
    await say("один");
    await say("два");
    await say("три");
    await waitFor(() => expect(turns()).toHaveLength(4)); // the one automatic repair turn (DEC-063)
    await waitFor(() => expect(turns()[3]?.dataset["state"]).toBe("rejected"));
    expect(turns().map((t) => t.dataset["state"])).toEqual([
      "text",
      "failed-ui",
      "rejected",
      "rejected",
    ]);
    expect(within(turns()[0] as HTMLElement).getByTestId("a2ui-text").textContent).toBe(
      "Только текст.",
    );
    expect(within(turns()[1] as HTMLElement).getByTestId("a2ui-placeholder")).toBeTruthy();
    expect(within(turns()[3] as HTMLElement).getByRole("alert").textContent).toContain(
      "не прошёл проверку",
    );
    expect(screen.queryAllByTestId("a2ui-surface")).toHaveLength(0);
  });

  const twoTurns: Outcome[] = [
    { text: "Создал.", messages: surface("s1", "A") },
    { text: "Обновил.", messages: retext("s1", "B") },
    { text: "Ещё одна.", messages: surface("s2", "C") },
  ];

  it.each([
    ["anchored", [["s1"], [], ["s2"]]],
    ["follow", [[], ["s1"], ["s2"]]],
    ["panel", [[], [], []]],
  ] as const)(
    "[SV-C26] placement %s puts each surface under the right turn (updated in place by surfaceId)",
    async (placement, expected) => {
      render(<Chat replies={twoTurns} placement={placement} />);
      for (const text of ["a", "b", "c"]) await say(text);
      const ids = (el: HTMLElement) =>
        within(el)
          .queryAllByTestId("a2ui-surface")
          .map((s) => s.dataset["surfaceId"]);
      expect(turns().map((t) => ids(t))).toEqual(expected);
      expect(screen.getAllByTestId("a2ui-surface")).toHaveLength(2);
      expect(screen.getByText("B")).toBeTruthy();
      if (placement === "panel")
        expect(ids(screen.getByTestId("a2ui-panel"))).toEqual(["s1", "s2"]);
    },
  );

  it("[SV-C26] interactive latest: only the latest UI turn's surfaces take input", async () => {
    render(<Chat replies={twoTurns} interactive="latest" />);
    for (const text of ["a", "b", "c"]) await act(() => say(text));
    const state = screen
      .getAllByTestId("a2ui-surface")
      .map((s) => [s.dataset["surfaceId"], s.dataset["interactive"], s.hasAttribute("inert")]);
    expect(state).toEqual([
      ["s1", "false", true],
      ["s2", "true", false],
    ]);
  });
});
