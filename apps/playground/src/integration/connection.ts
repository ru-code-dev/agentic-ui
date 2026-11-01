import { createAgentClient } from "@agentic-ui/a2ui-react/core";
import { AGENT_API_BASE } from "../agent/endpoint.ts";
import { scriptedServer, type Script } from "./scripted-server.ts";

export type Mode = "live" | "scripted";

/** What a demo connects to (`useA2UIChat({ ...connection })`); `llm` is the Bring-your-own host's own model. */
export interface Connection {
  readonly endpoint: string;
  readonly fetch: typeof globalThis.fetch;
  /** A host's own LLM call: the raw model reply (text with `<a2ui-json>` blocks). */
  readonly llm: (text: string) => Promise<string>;
}

/** One request of the demo as the Events tab shows it. */
export interface LoggedCall {
  readonly id: number;
  readonly time: string;
  readonly request: string;
  readonly body: unknown;
  readonly status: number | "network";
  readonly reply: unknown;
}

const OPTIONAL = new Set(["cancel", "progress", "models", "model", "health"]);

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/** A model reply as an LLM writes it: the text, then the UI block (what `extractA2UI` reads). */
export const rawReply = (text: string, messages: readonly unknown[]) =>
  messages.length === 0 ? text : `${text}\n<a2ui-json>${JSON.stringify(messages)}</a2ui-json>`;

export interface ConnectOptions {
  readonly mode: Mode;
  readonly script: Script;
  /** false: a minimal server, only /prompt and /action (Live: the optional endpoints are cut off here). */
  readonly optional: boolean;
  readonly log: (call: Omit<LoggedCall, "id">) => void;
}

/**
 * The connection of an Integration page: Live = our agent server through the dev proxy (`/api`), Scripted =
 * the built-in fake agent in the browser (no server, no LLM, deterministic). Every request is logged.
 */
export function connect({ mode, script, optional, log }: ConnectOptions): Connection {
  const server: typeof globalThis.fetch =
    mode === "scripted"
      ? scriptedServer(script, { optional })
      : (input, init) => globalThis.fetch(input, init);
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "http://page");
    const name = url.pathname.split("/").at(-1) ?? "";
    const entry = {
      time: new Date().toISOString(),
      request: `${init?.method ?? "GET"} /${name}`,
      body: init?.body === undefined ? undefined : parse(String(init.body)),
    };
    try {
      const response =
        !optional && OPTIONAL.has(name)
          ? new Response("Not Found", { status: 404 })
          : await server(input, init);
      log({ ...entry, status: response.status, reply: parse(await response.clone().text()) });
      return response;
    } catch (failure) {
      log({ ...entry, status: "network", reply: String(failure) });
      throw failure;
    }
  };
  const endpoint = mode === "scripted" ? "/scripted" : AGENT_API_BASE;
  const client = createAgentClient({ endpoint, fetch });
  const chatId = `byo-${Date.now().toString(36)}`;
  const llm = async (text: string) => {
    if (mode === "scripted") {
      const reply = script({ kind: "prompt", text });
      const raw = rawReply(reply.text, reply.messages ?? []);
      log({ time: new Date().toISOString(), request: "LLM", body: text, status: 200, reply: raw });
      return raw;
    }
    // Live: our server answers text + validated messages; written back as the raw reply a host LLM gives.
    const outcome = await client.prompt(chatId, text);
    return rawReply(outcome.text, outcome.messages);
  };
  return { endpoint, fetch, llm };
}
