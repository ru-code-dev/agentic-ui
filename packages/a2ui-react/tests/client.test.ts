// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";
import { AgentRequestError, createAgentClient } from "../src/core/index.ts";
import { scriptedFetch } from "./support/scripted.ts";

describe("createAgentClient [SV-C26]", () => {
  it("[SV-C26] posts /prompt with the host's fetch and headers; the outcome is shape- and version-checked", async () => {
    const { fetch, seen } = scriptedFetch([{ text: "Привет" }]);
    const client = createAgentClient({ endpoint: "/base/api/", fetch, headers: { "X-Csrf": "t" } });
    const outcome = await client.prompt("c1", "Покажи", undefined, "turn-1");
    expect(outcome.text).toBe("Привет");
    expect(seen[0]).toEqual({
      path: "prompt",
      body: { chatId: "c1", text: "Покажи", repairOf: "turn-1" },
      headers: { "Content-Type": "application/json", "X-Csrf": "t" },
    });
  });

  it("[SV-C26] a server with only /prompt and /action: optional endpoints are probed once, absence never fails", async () => {
    const { fetch, seen } = scriptedFetch([]);
    const client = createAgentClient({ endpoint: "/api", fetch });
    expect(await client.models("c1")).toBeUndefined();
    expect(await client.cancel("c1")).toBeUndefined();
    expect(await client.progress("c1")).toBeUndefined();
    expect(await client.models("c1")).toBeUndefined();
    expect(await client.cancel("c1")).toBeUndefined();
    expect(await client.progress("c1")).toBeUndefined();
    expect(seen.map((s) => s.path)).toEqual(["models", "cancel", "progress"]);
  });

  it("[SV-C26] a 404 that is the server's own JSON (/progress before the chat's first request) keeps the endpoint", async () => {
    const { fetch, seen } = scriptedFetch([], {
      progress: () => [404, { error: "not_found", message: "no request" }],
    });
    const client = createAgentClient({ endpoint: "/api", fetch });
    expect(await client.progress("c1")).toBeUndefined();
    expect(await client.progress("c1")).toBeUndefined();
    expect(seen.map((s) => s.path)).toEqual(["progress", "progress"]);
  });

  it("[SV-C26] an answer of another contract version is refused (DEC-056)", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ chatId: "c", contractVersion: "other sha256:000000000000" }), {
        status: 200,
      })) as typeof globalThis.fetch;
    const failure = await createAgentClient({ endpoint: "/api", fetch })
      .prompt("c", "x")
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AgentRequestError);
    expect((failure as AgentRequestError).problem.kind).toBe("contract");
  });
});
