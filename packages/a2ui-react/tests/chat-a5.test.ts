// @vitest-environment node
/**
 * A5 review findings on the headless chat: A5-03 (ported from attack/web/a5-repair-burst.test.ts), A5-06 (killing
 * tests for the mutants W4, W5, W10, W11, W12 of attack/mutation/web-mutants.json) and A5-09 (requestId per
 * request, attack/concurrency/retry-dup.mjs: a retry resends the same id so the server joins it).
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { createA2UIChat, createSurfaceLog, REPAIR_DELAY_MS } from "../src/core/index.ts";
import { retext, scriptedFetch, surface, type Seen } from "./support/scripted.ts";

const prompts = (seen: readonly Seen[]) => seen.filter((s) => s.path === "prompt");
const calls = (seen: readonly Seen[]) =>
  seen.filter((s) => s.path === "prompt" || s.path === "action");
const settle = () => new Promise((resolve) => setTimeout(resolve, REPAIR_DELAY_MS + 50));
/** surface() whose root names a child nobody defines: the page store rejects it. */
const dangling = (surfaceId: string) => {
  const messages = surface(surfaceId, "x") as {
    updateComponents?: { components: { children?: string[] }[] };
  }[];
  messages[1]!.updateComponents!.components[0]!.children!.push("missing");
  return messages;
};
const offline = () => {
  throw new TypeError("Failed to fetch");
};

describe("[A5-03] a render-error burst goes into one repair", () => {
  it("[A5-03] a render-error repair carries every error of the burst, not only the first", async () => {
    const { fetch, seen } = scriptedFetch([
      { messages: surface("s1", "A"), turnId: "t1" },
      { messages: surface("s1", "B"), turnId: "t2" },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    chat.reportRenderError("Button «b1»: Objects are not valid as a React child");
    chat.reportRenderError("Avatar «a1»: Objects are not valid as a React child");
    chat.reportRenderError("Button «b1»: Objects are not valid as a React child"); // the same error twice
    await vi.waitFor(() => expect(prompts(seen)).toHaveLength(2));
    const repair = String(prompts(seen)[1]?.body?.["text"]);
    expect(repair).toContain("Button «b1»");
    expect(repair).toContain("Avatar «a1»");
    expect(repair.match(/Button «b1»/g)).toHaveLength(1);
    chat.reportRenderError("Button «b1»: again"); // the repaired reply is never repaired again
    await settle();
    expect(prompts(seen)).toHaveLength(2);
  });
});

describe("[A5-06] behaviours that had no killing test", () => {
  it("[A5-06] W10: an action's sent data model is adopted by the page store before the reply", async () => {
    const { fetch } = scriptedFetch([
      { messages: surface("s1", "A") },
      { messages: retext("s1", "B") },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    await chat.action({ name: "go", surfaceId: "s1", dataModel: { n: 5 } });
    expect(JSON.stringify(chat.surfaces.messages())).toContain('"value":{"n":5}');
  });

  it("[A5-06] W5: a shown reply without turnId is not undone locally by its repair (no repairOf either)", async () => {
    const { fetch, seen } = scriptedFetch([
      { messages: surface("s1", "A") },
      { messages: retext("s1", "B") },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    chat.reportRenderError("Button «b»: broken");
    await vi.waitFor(() => expect(chat.getState().turns).toHaveLength(2));
    await vi.waitFor(() => expect(chat.getState().turns[1]?.result?.state).toBe("ui"));
    expect(prompts(seen)[1]?.body?.["repairOf"]).toBeUndefined();
    expect(chat.surfaces.surfaceIds()).toEqual(["s1"]);
  });

  it("[A5-06] W11: a render error while the last turn showed no UI asks for no repair", async () => {
    const { fetch, seen } = scriptedFetch([
      { messages: surface("s1", "A"), turnId: "t1" },
      { text: "Просто текст.", turnId: "t2" },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    await chat.send("а ещё?");
    chat.reportRenderError("Button «b»: broken");
    await settle();
    expect(prompts(seen)).toHaveLength(2);
  });

  it("[A5-06] W12: «Повторить» after a rejected repair resends the user's request, not the repair", async () => {
    const { fetch, seen } = scriptedFetch([
      { messages: dangling("s1") },
      { messages: dangling("s1") },
      { messages: surface("s1", "A") },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    await vi.waitFor(() => expect(chat.getState().turns[1]?.result?.state).toBe("rejected"));
    await chat.retry();
    expect(prompts(seen).map((s) => s.body?.["text"])).toEqual([
      "покажи",
      expect.stringContaining("Страница отклонила"),
      "покажи",
    ]);
  });

  it("[A5-06] W4: undo is refused once anything was merged after the last reply", () => {
    const log = createSurfaceLog();
    expect(log.apply(surface("s1", "A")).valid).toBe(true);
    log.adoptData("s1", { n: 7 });
    const before = log.messages();
    expect(log.undoReply()).toBe(false);
    expect(log.messages()).toEqual(before);
  });
});

describe("[A5-09] one requestId per request; a retry keeps it", () => {
  it("[A5-09] a retried prompt and a retried action resend their requestId; new requests and repairs get new ones", async () => {
    const { fetch, seen } = scriptedFetch([
      offline,
      { messages: surface("s1", "A"), turnId: "t1" },
      offline,
      { messages: dangling("s1") },
      { messages: retext("s1", "C") },
    ]);
    const chat = createA2UIChat({ endpoint: "/api", fetch });
    await chat.send("покажи");
    expect(chat.getState().turns[0]?.result?.state).toBe("error");
    await chat.retry();
    await chat.action({ name: "go", surfaceId: "s1", dataModel: { n: 1 } });
    await chat.retry();
    await vi.waitFor(() => expect(calls(seen)).toHaveLength(5));
    const ids = calls(seen).map((s) => s.body?.["requestId"]);
    expect(ids.every((id) => typeof id === "string" && /^req-[0-9a-f]{16}$/.test(id))).toBe(true);
    expect(calls(seen).map((s) => s.path)).toEqual([
      "prompt",
      "prompt",
      "action",
      "action",
      "prompt",
    ]);
    expect(ids[1]).toBe(ids[0]); // the prompt's retry
    expect(ids[3]).toBe(ids[2]); // the action's retry: the server joins a still-running first press
    expect(new Set([ids[0], ids[2], ids[4]]).size).toBe(3); // a new action and the repair are new requests
  });
});
