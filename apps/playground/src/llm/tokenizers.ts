import { Tokenizer } from "@huggingface/tokenizers";
import { Tiktoken, type TiktokenBPE } from "js-tiktoken/lite";
import { publicUrl } from "../app/base-path.ts";

export type TokenizerId = "qwen" | "o200k" | "approx";

export interface TokenCounter {
  readonly id: TokenizerId;
  count(text: string): number;
}

export interface TokenizerInfo {
  readonly id: TokenizerId;
  readonly label: string;
  /** Exact counts for that model family, or an approximation. */
  readonly exact: boolean;
  readonly detail: string;
}

/** The selectable tokenizers (DEC-003). No offline Claude tokenizer exists, so none is offered. */
export const TOKENIZERS: readonly TokenizerInfo[] = [
  {
    id: "qwen",
    label: "Qwen2.5 / Qwen3",
    exact: true,
    detail: "Vendored tokenizer.json, runs offline",
  },
  {
    id: "o200k",
    label: "OpenAI o200k",
    exact: true,
    detail: "js-tiktoken o200k_base (GPT-4o family)",
  },
  { id: "approx", label: "Approximate", exact: false, detail: "4 characters per token" },
];

/** Wraps a counting function with a small cache keyed by the text. */
function memoized(id: TokenizerId, count: (text: string) => number): TokenCounter {
  const cache = new Map<string, number>();
  return {
    id,
    count(text) {
      const hit = cache.get(text);
      if (hit !== undefined) return hit;
      const value = count(text);
      if (cache.size > 500) cache.clear();
      cache.set(text, value);
      return value;
    },
  };
}

export const approxCounter: TokenCounter = memoized("approx", (text) => Math.ceil(text.length / 4));

export function createQwenCounter(tokenizerJson: object, tokenizerConfig: object): TokenCounter {
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  return memoized(
    "qwen",
    (text) => tokenizer.encode(text, { add_special_tokens: false }).ids.length,
  );
}

export function createO200kCounter(ranks: TiktokenBPE): TokenCounter {
  const encoding = new Tiktoken(ranks);
  return memoized("o200k", (text) => encoding.encode(text, "all").length);
}

const loaded = new Map<TokenizerId, Promise<TokenCounter>>();

/** Loads a tokenizer once (lazily: the Qwen vocabulary is 7 MB, o200k ranks 2 MB). */
export function loadCounter(id: TokenizerId): Promise<TokenCounter> {
  const cached = loaded.get(id);
  if (cached !== undefined) return cached;
  const next =
    id === "approx"
      ? Promise.resolve(approxCounter)
      : id === "o200k"
        ? import("js-tiktoken/ranks/o200k_base").then((module) =>
            createO200kCounter(module.default),
          )
        : Promise.all([
            fetch(publicUrl("tokenizers/qwen2.5/tokenizer.json")).then(
              (response) => response.json() as Promise<object>,
            ),
            fetch(publicUrl("tokenizers/qwen2.5/tokenizer_config.json")).then(
              (response) => response.json() as Promise<object>,
            ),
          ]).then(([json, config]) => createQwenCounter(json, config));
  loaded.set(id, next);
  return next;
}
