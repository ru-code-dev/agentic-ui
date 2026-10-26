import { describe, expect, it } from "vite-plus/test";
import type { MockRule } from "../state/workspace-store.ts";
import { formatSource } from "./format-source.ts";
import { matchingReplies, parseRule } from "./mock-replies.ts";

const rule = (patch: Partial<MockRule>): MockRule => ({
  id: "r",
  event: "login.submit",
  messages: "[]",
  enabled: true,
  ...patch,
});

describe("mock replies (PG-12)", () => {
  it("returns the replies of enabled rules for the fired event", () => {
    const rules = [
      rule({ id: "a", messages: '[{"version":"v0.9"}]' }),
      rule({ id: "b", enabled: false }),
      rule({ id: "c", event: "other" }),
    ];
    expect(matchingReplies(rules, "login.submit").map((reply) => reply.rule.id)).toEqual(["a"]);
  });

  it("explains reply JSON that is not a message array", () => {
    expect(parseRule(rule({ messages: "{}" }))).toEqual({
      ok: false,
      error: "Reply must be a JSON array of messages",
    });
    expect(parseRule(rule({ messages: "[" })).ok).toBe(false);
  });
});

describe("formatSource (PG-03, PG-17)", () => {
  it("pretty-prints JSON and keeps JSONL one message per line", () => {
    expect(formatSource('[{"version":"v0.9"}]')).toBe('[\n  {\n    "version": "v0.9"\n  }\n]');
    const jsonl = '{"version":"v0.9","createSurface":{}}\n  {"version":"v0.9","deleteSurface":{}}';
    expect(formatSource(jsonl)).toBe(
      '{"version":"v0.9","createSurface":{}}\n{"version":"v0.9","deleteSurface":{}}\n',
    );
  });

  it("leaves invalid content unchanged", () => {
    expect(formatSource("[1,")).toBe("[1,");
  });
});
