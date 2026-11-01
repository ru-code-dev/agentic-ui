// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import type { AgentClient, Outcome, Progress } from "../src/core/client.ts";
import { createA2UIChat } from "../src/core/chat.ts";
import { AgentRequestError } from "../src/core/responses.ts";
import {
  deferred,
  fakeClient,
  hanging,
  httpFailure,
  MODELS,
  outcome,
  until,
} from "./support/fake-client.ts";

// The Agent page's chat on failures (ported from the playground controller, PKG-A-O1).

const repairing: Progress = {
  chatId: "x",
  state: "repairing",
  attempt: 2,
  maxAttempts: 4,
  errors: ["bad"],
  errorCount: 1,
  elapsedMs: 1,
};
const chatOf = (client: AgentClient) => createA2UIChat({ client, pollMs: 5 });
const fired = { name: "form.submit", surfaceId: "s1", dataModel: { form: { name: "Анна" } } };

describe("Agent page controller on failures [SV-C20, SV-C25, PR-03]", () => {
  it("an action fired while a turn runs is not sent (the chat is busy)", async () => {
    const answer = deferred<Outcome>();
    const client = fakeClient({ prompt: () => answer.promise });
    const chat = chatOf(client);
    const turn = chat.send("x");
    expect(chat.busy()).toBe(true);
    await chat.action(fired);
    expect(client.action).not.toHaveBeenCalled();
    answer.resolve(outcome());
    await turn;
    expect(chat.busy()).toBe(false);
  });

  it("an error turn's Повторить repeats the failed action with its data model, not the prompt", async () => {
    const action = vi
      .fn<AgentClient["action"]>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(outcome({ messages: [] }));
    const client = fakeClient({ action });
    const chat = chatOf(client);
    await chat.send("x");
    await chat.action(fired);
    expect(chat.getState().turns[1]?.result).toMatchObject({ state: "error", reason: "network" });
    await chat.retry();
    expect(client.prompt).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls[1]?.[1]).toEqual(action.mock.calls[0]?.[1]);
    expect(action.mock.calls[1]?.[1].dataModel).toEqual({ form: { name: "Анна" } });
  });

  it("keeps polling progress after a failed poll (5xx, network) and shows the next progress", async () => {
    const answer = deferred<Outcome>();
    const progress = vi
      .fn<AgentClient["progress"]>()
      .mockRejectedValueOnce(httpFailure(502, "Bad Gateway", "GET /api/progress"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(repairing);
    const chat = chatOf(fakeClient({ prompt: () => answer.promise, progress }));
    const turn = chat.send("x");
    await until(() => chat.getState().working?.progress?.state === "repairing");
    answer.resolve(outcome());
    await turn;
  });

  it("a refused model change keeps the model and shows the server's reason", async () => {
    const setModel = vi.fn(async () => {
      throw httpFailure(400, "unknown model", "POST /api/model");
    });
    const chat = chatOf(fakeClient({ models: async () => MODELS, setModel }));
    await chat.loadModels();
    await chat.setModel("b");
    expect(chat.getState().models).toMatchObject({
      current: "a",
      error: "Модель не изменена: 400 unknown model",
    });
  });

  it("a cancel the server did not apply re-enables Cancel", async () => {
    const answer = deferred<Outcome>();
    const chat = chatOf(fakeClient({ prompt: () => answer.promise, cancel: async () => false }));
    const turn = chat.send("x");
    await chat.cancel();
    expect(chat.getState().working).toMatchObject({ cancelling: false, cancelUnconfirmed: true });
    answer.resolve(outcome());
    await turn;
  });

  it("a /cancel answer of the wrong shape is a chat notice with the details (A4-21)", async () => {
    const problem = {
      kind: "shape" as const,
      request: "POST /api/cancel",
      httpStatus: 200,
      title: "Ответ сервера на /cancel не соответствует контракту",
      details: ['"cancelled" must be a boolean'],
      excerpt: "",
    };
    const cancel = vi.fn(async () => Promise.reject(new AgentRequestError(problem)));
    const chat = chatOf(fakeClient({ prompt: hanging, cancel }));
    void chat.send("x");
    await chat.cancel();
    expect(chat.getState().notices).toEqual([problem]);
    chat.dispose();
  });
});
