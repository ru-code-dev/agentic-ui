/**
 * DEC-054 / DEC-056 (moved from the playground, PKG): every server answer the client uses is shape-checked here before anything
 * reads it. A malformed answer, a server with another contract version, an HTTP error or no answer
 * at all becomes an AgentRequestError carrying a ResponseProblem: which request, the HTTP status,
 * what is wrong and a truncated excerpt of the raw body, shown as a placeholder (never a crash, never
 * a silent "network").
 */

import { CONTRACT_VERSION } from "./contract-version.ts";

/** The contract version this page was built with (DEC-056; the package embeds it at build time). */
export const PAGE_CONTRACT_VERSION: string = CONTRACT_VERSION;
/** Longest raw-body excerpt kept in a problem. */
export const EXCERPT_CHARS = 400;

export type ProblemKind = "network" | "http" | "shape" | "contract" | "invalid-ui" | "timeout";

export interface ResponseProblem {
  readonly kind: ProblemKind;
  /** e.g. `POST /api/prompt`. */
  readonly request: string;
  /** undefined: no HTTP answer (network failure, aborted, timed out). */
  readonly httpStatus: number | undefined;
  /** One line: what went wrong. */
  readonly title: string;
  /** What exactly is wrong (fields, validator messages, server message). */
  readonly details: readonly string[];
  /** The raw body (truncated), "" when there was none. */
  readonly excerpt: string;
}

/** A request the server did not answer with a usable body (`status` 0 = no HTTP answer). */
export class AgentRequestError extends Error {
  readonly status: number;
  readonly problem: ResponseProblem;
  /** The answer is the server's own JSON (it carries `contractVersion`): the endpoint exists (SV-C26 probing). */
  readonly served: boolean;
  constructor(problem: ResponseProblem, served = false) {
    super(
      [`${problem.httpStatus ?? problem.kind} ${problem.title}`, ...problem.details].join(": "),
    );
    this.name = "AgentRequestError";
    this.status = problem.httpStatus ?? 0;
    this.problem = problem;
    this.served = served;
  }
}

export const excerptOf = (raw: string) =>
  raw.length <= EXCERPT_CHARS ? raw : `${raw.slice(0, EXCERPT_CHARS)}… (${raw.length} символов)`;

export const contractMismatch = (server: unknown) =>
  `Версия контракта сервера ${typeof server === "string" && server !== "" ? server : "не указана"} ≠ версии страницы ${PAGE_CONTRACT_VERSION} — обновите одну из сторон`;

type Test = (value: unknown) => boolean;
/** [field, test, expected type, optional (absent or null allowed)] */
type Field = readonly [string, Test, string, boolean?];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str: Test = (value) => typeof value === "string";
const num: Test = (value) => typeof value === "number" && Number.isFinite(value);
const bool: Test = (value) => typeof value === "boolean";
const strings: Test = (value) => Array.isArray(value) && value.every(str);
const oneOf =
  (...values: readonly string[]): Test =>
  (value) =>
    typeof value === "string" && values.includes(value);

const shown = (value: unknown) => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

/** What is wrong with `body` against `fields` (empty = it has the shape). */
export function shapeProblems(body: unknown, fields: readonly Field[]): string[] {
  if (!isObject(body)) return [`the body is not a JSON object (got ${shown(body)})`];
  return fields.flatMap(([name, test, expected, optional = false]) => {
    const value = body[name];
    if (value === undefined || (optional && value === null))
      return optional ? [] : [`"${name}" is missing (expected ${expected})`];
    return test(value) ? [] : [`"${name}" must be ${expected}, got ${shown(value)}`];
  });
}

const OUTCOME: readonly Field[] = [
  ["chatId", str, "a string"],
  ["status", oneOf("ok", "fallback", "cancelled"), '"ok", "fallback" or "cancelled"'],
  ["messages", Array.isArray, "an array"],
  ["text", str, "a string"],
  ["fallback", bool, "a boolean"],
  ["errors", strings, "an array of strings"],
  ["attempts", num, "a number"],
  ["reason", str, "a string", true],
  ["durationMs", num, "a number"],
  ["turnId", str, "a string", true],
];
const PROGRESS: readonly Field[] = [
  ["chatId", str, "a string"],
  [
    "state",
    oneOf("running", "repairing", "done", "fallback", "cancelled"),
    "running, repairing, done, fallback or cancelled",
  ],
  ["attempt", num, "a number"],
  ["maxAttempts", num, "a number"],
  ["errors", strings, "an array of strings"],
  ["errorCount", num, "a number"],
  ["elapsedMs", num, "a number"],
];
const MODEL_INFO: Test = (value) =>
  isObject(value) &&
  str(value.id) &&
  str(value.name) &&
  (value.description === undefined || value.description === null || str(value.description));
const MODELS: readonly Field[] = [
  [
    "models",
    (value) => Array.isArray(value) && value.every(MODEL_INFO),
    "[{id, name, description?}]",
  ],
  ["default", str, "a string", true],
  ["current", str, "a string", true],
];
const MODEL: readonly Field[] = [
  ["chatId", str, "a string"],
  ["model", str, "a string"],
];
const CANCEL: readonly Field[] = [
  ["chatId", str, "a string"],
  ["cancelled", bool, "a boolean"],
];

/** The shapes of the answers the page reads, per endpoint (SERVER-CONTRACT.md). */
export const SHAPES = {
  prompt: OUTCOME,
  action: OUTCOME,
  progress: PROGRESS,
  models: MODELS,
  model: MODEL,
  cancel: CANCEL,
} as const;

export type Endpoint = keyof typeof SHAPES;

/**
 * Problem of a 2xx body (or a 500 outcome body) of `endpoint`, undefined when it is usable: the
 * contract version first (another contract = nothing else can be trusted), then the shape.
 */
export function bodyProblem(
  endpoint: Endpoint,
  body: unknown,
): Pick<ResponseProblem, "kind" | "title" | "details"> | undefined {
  const version = isObject(body) ? body.contractVersion : undefined;
  if (version !== PAGE_CONTRACT_VERSION)
    return { kind: "contract", title: contractMismatch(version), details: [] };
  const details = shapeProblems(body, SHAPES[endpoint]);
  return details.length === 0
    ? undefined
    : { kind: "shape", title: `Ответ сервера на /${endpoint} не соответствует контракту`, details };
}
