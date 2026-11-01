// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { AgentClient, Outcome } from "../src/core/client.ts";
import { CANCEL_GRACE_MS, createA2UIChat } from "../src/core/chat.ts";
import { AgentRequestError } from "../src/core/responses.ts";
import { fakeClient, hanging, MODELS, outcome, textSurface } from "./support/fake-client.ts";

// A3 review reproductions on the chat the Agent page runs (ported from the playground controller, PKG-A-O1).

const chatOf = (client: AgentClient) => createA2UIChat({ client, endpoint: "/api", pollMs: 5 });
afterEach(() => vi.useRealTimers());

describe("the page never renders UI its own validator rejects [A3-15, DEC-054]", () => {
  it("an ok outcome with an undefined child is a rejected placeholder turn, the surfaces are kept", async () => {
    const broken = textSurface("s1");
    (broken[1] as { updateComponents: { components: object[] } }).updateComponents.components = [
      { id: "root", component: "Flex", children: ["missing"] },
    ];
    const chat = chatOf(fakeClient({ prompt: vi.fn(async () => outcome({ messages: broken })) }));
    await chat.send("x");
    const result = chat.getState().turns[0]?.result;
    expect(result?.state).toBe("rejected");
    expect(result?.problem).toMatchObject({ kind: "invalid-ui", request: "POST /prompt" });
    expect(result?.problem?.details.join(" ")).toContain("missing");
    expect(chat.surfaces.surfaceIds()).toEqual([]);
    chat.dispose();
  });

  it("names the request with the chat's base path when the chat made the client (A4-23)", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const chat = createA2UIChat({ endpoint: "/some/api", fetch });
    await chat.send("x");
    expect(chat.getState().turns[0]?.result?.problem?.request).toBe("POST /some/api/prompt");
    chat.dispose();
  });

  it("a patch is validated together with the surface it patches", async () => {
    const patch = [
      {
        version: "v0.9",
        updateComponents: { surfaceId: "s1", components: [{ id: "root", component: "Bogus" }] },
      },
    ];
    const chat = chatOf(fakeClient({ action: vi.fn(async () => outcome({ messages: patch })) }));
    await chat.send("x");
    await chat.action({ name: "go", surfaceId: "s1", dataModel: {} });
    expect(chat.getState().turns[1]?.result?.state).toBe("rejected");
    expect(JSON.stringify(chat.surfaces.messages())).not.toContain("Bogus");
    expect(chat.getState().turns[1]?.result?.messages).toEqual([]);
    chat.dispose();
  });
});

describe("a malformed answer is an error turn with the details [A3-14, DEC-054]", () => {
  it("keeps request, HTTP status and excerpt; the reason is the problem kind, not network", async () => {
    const problem = {
      kind: "shape" as const,
      request: "POST /api/prompt",
      httpStatus: 200,
      title: "Ответ сервера на /prompt не соответствует контракту",
      details: ['"messages" must be an array, got null'],
      excerpt: '{"messages":null}',
    };
    const prompt = vi.fn(async () => Promise.reject(new AgentRequestError(problem)));
    const chat = chatOf(fakeClient({ prompt }));
    await chat.send("x");
    expect(chat.getState().turns[0]?.result).toMatchObject({
      state: "error",
      reason: "shape",
      problem,
    });
  });
});

describe("Cancel always gets the user out [A3-16, A3-20]", () => {
  it("a /cancel that fails on the network re-enables Cancel (mutant M1)", async () => {
    const cancel = vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")));
    const chat = chatOf(fakeClient({ prompt: hanging, cancel }));
    void chat.send("x");
    await chat.cancel();
    expect(chat.getState().working).toMatchObject({ cancelling: false, cancelUnconfirmed: true });
    chat.dispose();
  });

  it("the next Cancel after an unconfirmed one stops waiting: the turn ends cancelled (local)", async () => {
    const chat = chatOf(fakeClient({ prompt: hanging, cancel: vi.fn(async () => false) }));
    const turn = chat.send("x");
    await chat.cancel();
    await chat.cancel();
    await turn;
    expect(chat.getState().working).toBeUndefined();
    expect(chat.getState().turns[0]?.result).toMatchObject({ state: "cancelled", reason: "local" });
  });

  it("a confirmed cancel whose request never answers ends after the grace", async () => {
    vi.useFakeTimers();
    const chat = chatOf(fakeClient({ prompt: hanging }));
    const turn = chat.send("x");
    await chat.cancel();
    expect(chat.getState().working?.cancelling).toBe(true);
    await vi.advanceTimersByTimeAsync(CANCEL_GRACE_MS + 10);
    await turn;
    expect(chat.getState().turns[0]?.result?.state).toBe("cancelled");
  });
});

describe("the model selector shows what the server uses [A3-17]", () => {
  it("after a failed re-apply in a new chat it shows the server's model for that chat", async () => {
    const client = fakeClient({ models: vi.fn(async () => MODELS) });
    const chat = chatOf(client);
    await chat.loadModels();
    await chat.setModel("b");
    vi.mocked(client.setModel).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await chat.reset();
    expect(chat.getState().models).toMatchObject({ current: "a", pending: false });
    expect(chat.getState().models?.error).toContain("Модель не изменена");
    await chat.send("x");
    expect(chat.getState().turns[0]?.model).toBe("a");
  });

  it("nothing is sent while POST /model is in flight", async () => {
    let release!: () => void;
    const setModel = vi.fn(
      (_chat: string, model: string) =>
        new Promise<string>((done) => (release = () => done(model))),
    );
    const client = fakeClient({ models: vi.fn(async () => MODELS), setModel });
    const chat = chatOf(client);
    await chat.loadModels();
    const change = chat.setModel("b");
    expect(chat.getState().models?.pending).toBe(true);
    await chat.send("x");
    expect(client.prompt).not.toHaveBeenCalled();
    release();
    await change;
    await chat.send("x");
    expect(chat.getState().turns[0]?.model).toBe("b");
  });
});

describe("progress of an older request is not shown [A3-19]", () => {
  it("ignores progress older than the turn (a request the client gave up on)", async () => {
    let resolve!: (value: Outcome) => void;
    const progress = vi.fn(async () => ({
      chatId: "x",
      state: "repairing" as const,
      attempt: 3,
      maxAttempts: 4,
      errors: ["a"],
      errorCount: 1,
      elapsedMs: 90_000,
    }));
    const prompt = () => new Promise<Outcome>((done) => (resolve = done));
    const chat = chatOf(fakeClient({ prompt, progress }));
    const turn = chat.send("x");
    await vi.waitFor(() => expect(progress.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(chat.getState().working?.progress).toBeUndefined();
    resolve(outcome());
    await turn;
  });
});
