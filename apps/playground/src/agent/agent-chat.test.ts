import { createA2UIChat, type Outcome } from "@agentic-ui/a2ui-react/core";
import { describe, expect, it } from "vite-plus/test";
import { createAgentLog, notSent } from "./agent-chat.ts";
import { fakeApi, outcome } from "./test-fixtures.ts";

const action = (name: string) => ({
  name,
  surfaceId: "s1",
  sourceComponentId: "b",
  context: undefined,
  timestamp: "2026-10-27T00:00:00.000Z",
  dataModel: { form: { name: "Анна" } },
});

describe("Agent page event log [SV-C20, PR-03]", () => {
  it("logs every surface action (a dropped one says so) and a reply event per turn that changed surfaces", async () => {
    let release!: (value: Outcome) => void;
    const prompt = async () => outcome();
    const chat = createA2UIChat({
      client: fakeApi({
        prompt,
        action: () => new Promise<Outcome>((done) => (release = done)),
      }),
    });
    const log = createAgentLog(chat);
    await chat.send("x");
    log.action(action("form.submit"), true);
    const turn = chat.action({ name: "form.submit", surfaceId: "s1", dataModel: {} });
    log.action(action("form.submit"), false);
    release(outcome({ messages: [], text: "только текст" }));
    await turn;
    expect(log.useLog.getState().events.map((e) => [e.kind, e.name])).toEqual([
      ["reply", "prompt → ok"],
      ["action", "form.submit"],
      ["action", notSent("form.submit")],
    ]);
    log.error("s1: boom");
    log.error("s1: boom");
    expect(log.useLog.getState().runtimeErrors).toEqual(["s1: boom"]);
    await chat.reset();
    expect(log.useLog.getState()).toEqual({ events: [], runtimeErrors: [] });
  });
});
