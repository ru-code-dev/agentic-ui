import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { UseA2UIChat } from "@agentic-ui/a2ui-react";
import {
  AgentRequestError,
  bodyProblem,
  CONTRACT_VERSION,
  createA2UIChat,
} from "@agentic-ui/a2ui-react/core";
import { fakeApi, httpAgentApi, outcome, surface } from "./test-fixtures.ts";

// A4-18: one case per A3F web mutant that survived the unit tests (WORKFLOW/review/a4-attack/attack/web/mutants).

vi.mock("@agentic-ui/a2ui-react", async (original) => ({
  ...(await original<typeof import("@agentic-ui/a2ui-react")>()),
  A2UIKitProvider: () => {
    throw new Error("surface wrapper exploded");
  },
}));

afterEach(() => vi.unstubAllGlobals());
const PROGRESS = {
  contractVersion: CONTRACT_VERSION,
  chatId: "c",
  state: "running",
  attempt: 1,
  maxAttempts: 4,
  errors: [],
  errorCount: 0,
};

const extend = (child: string) => [
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "s1",
      components: [{ id: "root", component: "Flex", children: [child] }],
    },
  },
];

describe("A3F guards each have a failing case [A4-18]", () => {
  it("M2: a contract version that differs only in case or spaces is refused", () => {
    for (const version of [` ${CONTRACT_VERSION} `, CONTRACT_VERSION.toUpperCase()])
      expect(bodyProblem("models", { contractVersion: version, models: [] })?.kind).toBe(
        "contract",
      );
  });

  it("M9: a progress answer without elapsedMs is a shape problem", () => {
    expect(bodyProblem("progress", PROGRESS)?.kind).toBe("shape");
    expect(bodyProblem("progress", { ...PROGRESS, elapsedMs: 5 })).toBeUndefined();
  });

  it("M11: a 500 of /models is a failure, not a server without the endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"message":"boom"}', { status: 500 })),
    );
    const failure = await httpAgentApi.models("c").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AgentRequestError);
  });

  it("M14: a reply is checked together with what earlier replies left (merged state, SV-C28)", async () => {
    const first = [
      surface("s1")[0],
      ...extend("t"),
      {
        version: "v0.9",
        updateComponents: {
          surfaceId: "s1",
          components: [{ id: "t", component: "Text", text: "T" }],
        },
      },
    ];
    const prompt = vi
      .fn()
      .mockResolvedValueOnce(outcome({ messages: first }))
      .mockResolvedValueOnce(outcome({ messages: extend("t") }))
      .mockResolvedValueOnce(outcome({ messages: extend("nope") }));
    const chat = createA2UIChat({ client: fakeApi({ prompt }), pollMs: 5 });
    for (const text of ["a", "b", "c"]) await chat.send(text);
    expect(chat.getState().turns.map((turn) => turn.result?.state)).toEqual([
      "ui",
      "ui",
      "rejected",
    ]);
    chat.dispose();
  });

  it("M16: a render error outside every component shows the preview's render-failed placeholder", async () => {
    const { AgentPreview } = await import("./agent-preview.tsx");
    const chat = {
      chatId: "c",
      surfaces: [{ id: "s1" }],
      chat: { reportRenderError: vi.fn() },
    } as unknown as UseA2UIChat;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AgentPreview chat={chat} />);
    quiet.mockRestore();
    expect((await screen.findByTestId("render-failed")).textContent).toContain(
      "surface wrapper exploded",
    );
  });
});
