// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import { createA2UIChat, REPAIR_DELAY_MS } from "../src/core/index.ts";
import { retext, scriptedFetch, surface, type Outcome } from "./support/scripted.ts";

const results = (chat: ReturnType<typeof createA2UIChat>) =>
  chat.getState().turns.map(
    ({ result }) =>
      result && {
        state: result.state,
        text: result.text,
        created: result.created,
        updated: result.updated,
      },
  );

describe("headless chat (core, no browser) [SV-C26, SV-C27]", () => {
  it("[SV-C27] a text-only reply is an explicit `text` turn; text + UI creates a surface, a follow-up updates it in place", async () => {
    const { fetch } = scriptedFetch([
      { text: "Просто ответ." },
      { text: "Вот таблица.", messages: surface("s1", "A") },
      { text: "Обновил.", messages: retext("s1", "B") },
      { text: "Новая тема.", messages: surface("s2", "C") },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch, chatId: "c1" });
    for (const text of ["вопрос", "покажи", "уточни", "другое"]) await chat.send(text);
    expect(results(chat)).toEqual([
      { state: "text", text: "Просто ответ.", created: [], updated: [] },
      { state: "ui", text: "Вот таблица.", created: ["s1"], updated: [] },
      { state: "ui", text: "Обновил.", created: [], updated: ["s1"] },
      { state: "ui", text: "Новая тема.", created: ["s2"], updated: [] },
    ]);
    expect(chat.surfaces.surfaceIds()).toEqual(["s1", "s2"]);
    expect(chat.getState().status).toBe("idle");
  });

  it("[SV-C27] text + failed UI: a fallback without a surface is `failed-ui` and keeps the text", async () => {
    const { fetch } = scriptedFetch([{ status: "fallback", text: "Ответ текстом." }]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    expect(results(chat)).toEqual([
      { state: "failed-ui", text: "Ответ текстом.", created: [], updated: [] },
    ]);
  });

  it("[SV-C26] a page-rejected reply leaves the surfaces unchanged and gets one repair turn with repairOf (DEC-063/064)", async () => {
    const replies: Outcome[] = [
      { text: "Плохо.", messages: retext("unknown", "x"), turnId: "t1" },
      { text: "Исправил.", messages: surface("s1", "A"), turnId: "t2" },
    ];
    const { fetch, seen } = scriptedFetch(replies);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    expect(chat.getState().turns[0]?.result?.state).toBe("rejected");
    expect(chat.getState().status).toBe("error");
    expect(chat.surfaces.surfaceIds()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, REPAIR_DELAY_MS + 50));
    await vi.waitFor(() => expect(chat.getState().turns[1]?.result?.state).toBe("ui"));
    const repair = seen.filter((s) => s.path === "prompt")[1]?.body;
    expect(repair?.["repairOf"]).toBe("t1");
    expect(String(repair?.["text"])).toContain("Ошибки");
    expect(chat.getState().turns[1]?.request).toMatchObject({ kind: "prompt", repair: true });
  });

  it("[SV-C26] a render error of the shown reply undoes it locally and asks for one repair (DEC-063/064)", async () => {
    const { fetch, seen } = scriptedFetch([
      { messages: surface("s1", "A"), turnId: "t1" },
      { messages: surface("s1", "B"), turnId: "t2" },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    chat.reportRenderError("Text «t»: boom");
    chat.reportRenderError("Text «t»: boom");
    await new Promise((resolve) => setTimeout(resolve, REPAIR_DELAY_MS + 50));
    await vi.waitFor(() => expect(chat.getState().turns).toHaveLength(2));
    await vi.waitFor(() => expect(chat.getState().turns[1]?.result?.state).toBe("ui"));
    expect(seen.filter((s) => s.path === "prompt")[1]?.body?.["repairOf"]).toBe("t1");
    expect(chat.surfaces.surfaceIds()).toEqual(["s1"]);
  });

  it("[SV-C26] Cancel on a server without /cancel aborts the request on the client", async () => {
    const { fetch } = scriptedFetch([]);
    const hanging = ((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/prompt")
        ? new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          )
        : fetch(input, init)) as typeof globalThis.fetch;
    const chat = createA2UIChat({ endpoint: "/api", fetch: hanging });
    const sent = chat.send("долго");
    await vi.waitFor(() => expect(chat.getState().status).toBe("working"));
    await chat.cancel();
    await sent;
    expect(chat.getState().turns[0]?.result).toMatchObject({ state: "cancelled", reason: "local" });
  });

  it("[SV-C26] an action sends the surface's data model; retry repeats a failed request; no /models = no choice", async () => {
    let fail = true;
    const { fetch, seen } = scriptedFetch([
      { messages: surface("s1", "A") },
      (body) => {
        if (fail) throw new Error("network down");
        return { text: `ok ${JSON.stringify(body["dataModel"])}` };
      },
      { text: "again" },
    ]);
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/action") && fail) {
        fail = false;
        throw new TypeError("network down");
      }
      return fetch(input, init);
    }) as typeof globalThis.fetch;
    const chat = createA2UIChat({ endpoint: "/api", fetch: flaky });
    await chat.loadModels();
    expect(chat.getState().models).toBeUndefined();
    await chat.send("покажи");
    await chat.action({ name: "go", surfaceId: "s1", dataModel: { n: 2 } });
    expect(chat.getState().turns[1]?.result?.state).toBe("error");
    await chat.retry();
    expect(chat.getState().turns[2]?.result?.text).toBe('ok {"n":2}');
    expect(seen.at(-1)?.body).toMatchObject({
      surfaceId: "s1",
      event: { name: "go" },
      dataModel: { n: 2 },
    });
  });
});
