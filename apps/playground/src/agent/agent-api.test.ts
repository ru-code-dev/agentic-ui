import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AgentRequestError, createAgentClient } from "@agentic-ui/a2ui-react/core";
import { AGENT_API_BASE } from "./endpoint.ts";
import { httpAgentApi, versioned } from "./test-fixtures.ts";

const reply = (status: number, body: unknown) =>
  new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function mockFetch(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const OUTCOME = versioned({
  chatId: "c1",
  status: "ok",
  messages: [],
  text: "",
  fallback: false,
  errors: [],
  attempts: 1,
  durationMs: 3,
});
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (error: unknown) => error as AgentRequestError,
  );

afterEach(() => vi.unstubAllGlobals());

describe("agent HTTP client [P8-agent-page, SV-C12]", () => {
  it("posts prompt and action as JSON to {base}/prompt and {base}/action", async () => {
    const fetch = mockFetch(reply(200, OUTCOME), reply(200, OUTCOME));
    expect(await httpAgentApi.prompt("c1", "Покажи")).toEqual(OUTCOME);
    await httpAgentApi.action("c1", { surfaceId: "s", event: { name: "go" }, dataModel: { a: 1 } });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ["/api/prompt", "POST", JSON.stringify({ chatId: "c1", text: "Покажи" })],
      [
        "/api/action",
        "POST",
        JSON.stringify({
          chatId: "c1",
          surfaceId: "s",
          event: { name: "go" },
          dataModel: { a: 1 },
        }),
      ],
    ]);
  });

  it("reads a 500 that carries the fallback outcome as an outcome; other errors throw", async () => {
    const fallback = { ...OUTCOME, status: "fallback", fallback: true, reason: "server_error" };
    mockFetch(reply(500, fallback), reply(429, { error: "queue_full", message: "busy" }));
    expect((await httpAgentApi.prompt("c", "x")).status).toBe("fallback");
    const failure = await failureOf(httpAgentApi.prompt("c", "x"));
    expect(failure).toBeInstanceOf(AgentRequestError);
    expect(failure).toMatchObject({ status: 429, message: "429 busy" });
    expect(failure?.problem).toMatchObject({
      kind: "http",
      request: "POST /api/prompt",
      httpStatus: 429,
    });
  });

  it("treats the optional progress and models endpoints as absent on 404 [SV-C20, SV-C25]", async () => {
    const fetch = mockFetch(reply(404, { error: "not_found" }), reply(404, undefined));
    expect(await httpAgentApi.progress("c 1")).toBeUndefined();
    expect(await httpAgentApi.models("c 1")).toBeUndefined();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/progress?chatId=c+1",
      "/api/models?chatId=c+1",
    ]);
  });

  it("a 5xx of progress is a failure, not an absent endpoint (mutant M2) [A3-21]", async () => {
    mockFetch(reply(502, "bad gateway"), reply(503, { error: "x", message: "down" }));
    // A fresh client: the page's one remembers an endpoint an earlier test found missing (SV-C26: probed once).
    const client = createAgentClient({ endpoint: AGENT_API_BASE });
    for (const status of [502, 503]) {
      const failure = await failureOf(client.progress("c"));
      expect(failure).toBeInstanceOf(AgentRequestError);
      expect(failure?.status).toBe(status);
    }
  });

  it("sends cancel and the chat's model choice", async () => {
    const fetch = mockFetch(
      reply(200, versioned({ chatId: "c", cancelled: true })),
      reply(200, versioned({ chatId: "c", model: "m2" })),
    );
    expect(await httpAgentApi.cancel("c")).toBe(true);
    expect(await httpAgentApi.setModel("c", "m2")).toBe("m2");
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.body])).toEqual([
      ["/api/cancel", JSON.stringify({ chatId: "c" })],
      ["/api/model", JSON.stringify({ chatId: "c", model: "m2" })],
    ]);
  });
});
