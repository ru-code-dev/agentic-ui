import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  AgentRequestError,
  bodyProblem,
  EXCERPT_CHARS,
  excerptOf,
  CONTRACT_VERSION,
} from "@agentic-ui/a2ui-react/core";
import { httpAgentApi, versioned } from "./test-fixtures.ts";

const OUTCOME = versioned({
  chatId: "c",
  status: "ok",
  messages: [],
  text: "",
  fallback: false,
  errors: [],
  attempts: 1,
  durationMs: 1,
});
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (error: unknown) => error as AgentRequestError,
  );
const answer = (status: number, body: string) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
};
afterEach(() => vi.unstubAllGlobals());

describe("server answers are checked before use [DEC-054, A3-14]", () => {
  it("accepts every endpoint's contract shape", () => {
    expect(bodyProblem("prompt", OUTCOME)).toBeUndefined();
    expect(bodyProblem("action", { ...OUTCOME, reason: null })).toBeUndefined();
    const progress = {
      chatId: "c",
      state: "running",
      attempt: 1,
      maxAttempts: 4,
      errors: [],
      errorCount: 0,
      elapsedMs: 5,
    };
    expect(bodyProblem("progress", versioned(progress))).toBeUndefined();
    expect(
      bodyProblem("models", versioned({ models: [{ id: "a", name: "A" }], default: "a" })),
    ).toBeUndefined();
    expect(bodyProblem("model", versioned({ chatId: "c", model: "" }))).toBeUndefined();
    expect(bodyProblem("cancel", versioned({ chatId: "c", cancelled: false }))).toBeUndefined();
  });

  it("names what is wrong: unknown status, missing errors, messages null, bad progress/models/model/cancel", () => {
    expect(bodyProblem("prompt", { ...OUTCOME, status: "partial" })?.details).toEqual([
      '"status" must be "ok", "fallback" or "cancelled", got "partial"',
    ]);
    expect(bodyProblem("prompt", { ...OUTCOME, errors: undefined })?.details).toEqual([
      '"errors" is missing (expected an array of strings)',
    ]);
    expect(bodyProblem("action", { ...OUTCOME, messages: null })?.details).toEqual([
      '"messages" must be an array, got null',
    ]);
    expect(bodyProblem("progress", versioned({ state: "running" }))?.kind).toBe("shape");
    expect(bodyProblem("models", versioned({ models: [{ id: 1 }] }))?.details).toHaveLength(1);
    expect(bodyProblem("model", versioned({ chatId: "c" }))?.details).toEqual([
      '"model" is missing (expected a string)',
    ]);
    expect(bodyProblem("cancel", versioned({ chatId: "c", cancelled: "yes" }))?.kind).toBe("shape");
    expect(bodyProblem("prompt", versioned([]) as unknown)?.kind).toBe("shape");
  });

  it("a missing or different contract version is refused with both values [DEC-056]", () => {
    const { contractVersion: _drop, ...bare } = OUTCOME;
    expect(bodyProblem("prompt", bare)).toEqual({
      kind: "contract",
      title: `Версия контракта сервера не указана ≠ версии страницы ${CONTRACT_VERSION} — обновите одну из сторон`,
      details: [],
    });
    const other = { ...OUTCOME, contractVersion: "urn:x sha256:000000000000" };
    expect(bodyProblem("models", other)?.title).toBe(
      `Версия контракта сервера urn:x sha256:000000000000 ≠ версии страницы ${CONTRACT_VERSION} — обновите одну из сторон`,
    );
  });

  it("keeps a truncated excerpt of the raw body", () => {
    const long = "x".repeat(EXCERPT_CHARS + 50);
    expect(excerptOf(long)).toBe(`${"x".repeat(EXCERPT_CHARS)}… (${long.length} символов)`);
    expect(excerptOf("short")).toBe("short");
  });

  it("a 500 JSON that is not a fallback outcome keeps the server's message (A3-14d)", async () => {
    answer(500, JSON.stringify({ status: "error", message: "database unavailable" }));
    const failure = await failureOf(httpAgentApi.prompt("c", "x"));
    expect(failure?.problem).toMatchObject({
      kind: "http",
      httpStatus: 500,
      title: "database unavailable",
      request: "POST /api/prompt",
    });
    expect(failure?.problem.excerpt).toContain("database unavailable");
  });

  it("a 200 that is not JSON, and a malformed 200, carry request, status and excerpt", async () => {
    answer(200, "<html>proxy</html>");
    expect((await failureOf(httpAgentApi.prompt("c", "x")))?.problem).toMatchObject({
      kind: "shape",
      httpStatus: 200,
      excerpt: "<html>proxy</html>",
    });
    answer(200, JSON.stringify({ ...OUTCOME, messages: null }));
    const failure = await failureOf(
      httpAgentApi.action("c", { surfaceId: "s", event: { name: "go" } }),
    );
    expect(failure?.problem).toMatchObject({ kind: "shape", request: "POST /api/action" });
    expect(failure?.message).not.toContain("network");
  });

  it("no answer is `network`; an answer the page aborted is `timeout`", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    expect((await failureOf(httpAgentApi.prompt("c", "x")))?.problem.kind).toBe("network");
    const abort = new AbortController();
    abort.abort("stop");
    expect((await failureOf(httpAgentApi.prompt("c", "x", abort.signal)))?.problem.kind).toBe(
      "timeout",
    );
  });
});
