// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import type { AgentClient, Outcome, Progress } from "../src/core/client.ts";
import { createA2UIChat, RETRY_EVENT } from "../src/core/chat.ts";
import {
  deferred,
  fakeClient,
  httpFailure,
  MODELS,
  outcome,
  textSurface,
  until,
} from "./support/fake-client.ts";

// The Agent page's turn logic (ported from the playground controller, PKG-A-O1): the page now runs this chat.

const repairing: Progress = {
  chatId: "x",
  state: "repairing",
  attempt: 2,
  maxAttempts: 4,
  errors: ["/updateComponents/components/0: bad"],
  errorCount: 1,
  elapsedMs: 5,
};
const chatOf = (client: AgentClient) => createA2UIChat({ client, pollMs: 5 });

describe("Agent page controller [P8-agent-page, SV-C20]", () => {
  it("shows a working state with polled repair progress, then the valid UI", async () => {
    const answer = deferred<Outcome>();
    const chat = chatOf(
      fakeClient({ prompt: () => answer.promise, progress: async () => repairing }),
    );
    const turn = chat.send("  Имя,Сумма\nАнна,1  ");
    expect(chat.getState().working?.progress).toBeUndefined();
    await until(() => chat.getState().working?.progress?.state === "repairing");
    answer.resolve(outcome({ attempts: 2 }));
    await turn;
    const state = chat.getState();
    expect(state.working).toBeUndefined();
    expect(state.turns.map((t) => [t.request, t.result?.state, t.result?.attempts])).toEqual([
      [{ kind: "prompt", text: "Имя,Сумма\nАнна,1" }, "ui", 2],
    ]);
    expect(chat.surfaces.messages()).toEqual(textSurface("s1"));
  });

  it("just waits when the progress endpoint is absent", async () => {
    const answer = deferred<Outcome>();
    const progress = vi.fn(async () => undefined);
    const chat = chatOf(fakeClient({ prompt: () => answer.promise, progress }));
    const turn = chat.send("x");
    await until(() => progress.mock.calls.length >= 3);
    await new Promise((done) => setTimeout(done, 30));
    expect(chat.getState().working?.progress).toBeUndefined();
    answer.resolve(outcome());
    await turn;
    expect(progress).toHaveBeenCalledTimes(3); // 3 answers without progress, then the chat just waits
    expect(chat.getState().turns[0]?.result?.state).toBe("ui");
  });

  it("cancels the running turn through /cancel; a cancelled turn keeps the current UI", async () => {
    const answer = deferred<Outcome>();
    const client = fakeClient({ prompt: () => answer.promise });
    const chat = chatOf(client);
    const turn = chat.send("long");
    await chat.cancel();
    expect(client.cancel).toHaveBeenCalledWith(chat.getState().chatId);
    expect(chat.getState().working?.cancelling).toBe(true);
    answer.resolve(outcome({ status: "cancelled", messages: [] }));
    await turn;
    expect(chat.getState().turns[0]?.result?.state).toBe("cancelled");
    expect(chat.surfaces.surfaceIds()).toEqual([]);
  });

  it("sends actions with the data model; updates apply in place, a new surface joins the others [SV-C28]", async () => {
    const update = [
      { version: "v0.9", updateDataModel: { surfaceId: "s1", path: "/a", value: 2 } },
    ];
    const action = vi
      .fn<AgentClient["action"]>()
      .mockResolvedValueOnce(outcome({ messages: update }))
      .mockResolvedValueOnce(outcome({ messages: textSurface("s2") }));
    const chat = chatOf(fakeClient({ action }));
    await chat.send("x");
    const fired = { name: "go", surfaceId: "s1", context: { id: 1 }, dataModel: { a: 1 } };
    await chat.action(fired);
    expect(action).toHaveBeenCalledWith(
      chat.getState().chatId,
      {
        surfaceId: "s1",
        event: { name: "go", context: { id: 1 } },
        dataModel: { a: 1 },
        requestId: expect.stringMatching(/^req-/), // A5-09
      },
      expect.any(AbortSignal),
    );
    expect(chat.getState().turns[1]?.result).toMatchObject({ updated: ["s1"], messages: update });
    await chat.action({ ...fired, context: undefined });
    // SV-C28: surfaces live for the whole chat; a new one is applied on top, nothing is replaced
    expect(chat.surfaces.surfaceIds()).toEqual(["s1", "s2"]);
    expect(chat.getState().turns[2]?.result?.created).toEqual(["s2"]);
  });

  it(`"${RETRY_EVENT}" (the fallback's Повторить) re-sends the last prompt [SV-C9]`, async () => {
    const client = fakeClient({
      prompt: vi.fn(async () => outcome({ status: "fallback", fallback: true })),
    });
    const chat = chatOf(client);
    await chat.send("Покажи таблицей");
    await chat.action({ name: RETRY_EVENT, surfaceId: "agent-fallback", dataModel: {} });
    expect(client.prompt).toHaveBeenCalledTimes(2);
    expect(vi.mocked(client.prompt).mock.calls[1]?.[1]).toBe("Покажи таблицей");
    expect(client.action).not.toHaveBeenCalled();
  });

  it("records a failed request as an error turn that can be retried", async () => {
    const prompt = vi
      .fn<AgentClient["prompt"]>()
      .mockRejectedValueOnce(httpFailure(429, "busy"))
      .mockResolvedValueOnce(outcome());
    const chat = chatOf(fakeClient({ prompt }));
    await chat.send("x");
    expect(chat.getState().turns[0]?.result).toMatchObject({
      state: "error",
      errors: ["429 busy"],
      reason: "http_429",
    });
    await chat.retry();
    expect(chat.getState().turns[1]?.result?.state).toBe("ui");
  });
});

describe("model selector [SV-C25]", () => {
  it("lists the CLI's models, applies the choice to the chat and keeps it for a new chat", async () => {
    const client = fakeClient({ models: async () => MODELS });
    const chat = chatOf(client);
    await chat.loadModels();
    expect(chat.getState().models).toEqual({ list: MODELS.models, current: "a", pending: false });
    await chat.setModel("b");
    const first = chat.getState().chatId;
    expect(client.setModel).toHaveBeenCalledWith(first, "b");
    await chat.send("x");
    expect(chat.getState().turns[0]?.model).toBe("b");
    await chat.reset();
    expect(chat.getState().chatId).not.toBe(first);
    expect(client.setModel).toHaveBeenLastCalledWith(chat.getState().chatId, "b");
    expect(chat.getState().turns).toEqual([]);
  });

  it("is hidden when the server offers no model list", async () => {
    const chat = chatOf(fakeClient());
    await chat.loadModels();
    expect(chat.getState().models).toBeUndefined();
  });
});
