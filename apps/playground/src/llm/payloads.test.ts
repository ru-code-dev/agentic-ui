import { describe, expect, it } from "vite-plus/test";
import { compositions } from "../examples.ts";
import { turnPayloads } from "./payloads.ts";

const NOW = "2026-10-27T12:00:00.000Z";
const login = compositions.find((example) => example.id === "01-login")?.messages ?? [];

describe("turnPayloads (PG-26 d)", () => {
  it("derives the action event and data model from the messages when nothing fired yet", () => {
    const [action, dataModel] = turnPayloads(login, undefined, {}, NOW);
    expect(JSON.parse(action?.json ?? "{}")).toMatchObject({
      version: "v0.9",
      action: { name: "login.submit", surfaceId: "login" },
    });
    expect(JSON.parse(dataModel?.json ?? "{}")).toEqual({
      a2uiClientDataModel: {
        version: "v0.9",
        surfaces: { login: { form: { email: "", password: "", remember: true } } },
      },
    });
  });

  it("uses the latest real event and its data model", () => {
    const latest = {
      id: 1,
      time: "2026-10-27T10:00:00.000Z",
      kind: "action" as const,
      surfaceId: "login",
      name: "login.submit",
      context: { email: "a@b.ru" },
      dataModel: { form: { email: "a@b.ru" } },
    };
    const [action, dataModel] = turnPayloads(login, latest, {}, NOW);
    expect(JSON.parse(action?.json ?? "{}").action.context).toEqual({ email: "a@b.ru" });
    expect(dataModel?.json).toContain("a@b.ru");
  });

  it("omits the data model for surfaces without sendDataModel", () => {
    const users = compositions.find((example) => example.id === "04-user-list")?.messages ?? [];
    expect(turnPayloads(users, undefined, {}, NOW)).toHaveLength(1);
  });

  it("resolves context bindings and names the source component", () => {
    const transfer = compositions.find((example) => example.id === "15-bank-transfer")?.messages;
    const [action] = turnPayloads(transfer ?? [], undefined, {}, NOW);
    const parsed = JSON.parse(action?.json ?? "{}").action;
    expect(parsed.timestamp).toBe(NOW);
    expect(parsed.sourceComponentId).not.toBe("root");
    expect(JSON.stringify(parsed.context)).not.toContain('"path"');
  });

  it("returns nothing when the messages have no action and nothing fired", () => {
    expect(turnPayloads([], undefined, {}, NOW)).toEqual([]);
  });
});
