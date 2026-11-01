import {
  AgentRequestError,
  bodyProblem,
  excerptOf,
  type Endpoint,
  type ProblemKind,
} from "./responses.ts";

/** `{base}/<endpoint>` with optional query parameters, for a path (`/api`) or an absolute URL base. */
export function agentUrl(
  base: string,
  endpoint: string,
  query: Readonly<Record<string, string>> = {},
): string {
  const url = `${base.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  const search = new URLSearchParams(query).toString();
  return search === "" ? url : `${url}?${search}`;
}

/** How one client reaches the server (SV-C26: auth is the host session's job: cookies, or `headers`). */
export interface Transport {
  readonly endpoint: string;
  /** undefined: `globalThis.fetch` at call time. */
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

export interface Call {
  readonly body?: object;
  readonly query?: Record<string, string>;
  readonly signal?: AbortSignal | undefined;
}

const fail = (
  request: string,
  kind: ProblemKind,
  httpStatus: number | undefined,
  title: string,
  details: readonly string[],
  raw = "",
  served = false,
) =>
  new AgentRequestError(
    { kind, request, httpStatus, title, details, excerpt: excerptOf(raw) },
    served,
  );

const parse = (raw: string): { json: boolean; value: unknown } => {
  try {
    return { json: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { json: false, value: undefined };
  }
};

export const field = (value: unknown, name: string) =>
  typeof value === "object" && value !== null && name in value
    ? (value as Record<string, unknown>)[name]
    : undefined;

const aborted = (
  request: string,
  status: number | undefined,
  signal: AbortSignal,
  message: string,
) =>
  fail(request, "timeout", status, "запрос прерван страницей", [String(signal.reason ?? message)]);

/** One request; every usable answer is shape- and version-checked (DEC-054, DEC-056). */
export async function send<T>(
  transport: Transport,
  endpoint: Endpoint,
  { body, query, signal }: Call = {},
): Promise<T> {
  const method = body === undefined ? "GET" : "POST";
  const url = agentUrl(transport.endpoint, endpoint, query);
  const request = `${method} ${url.replace(/\?.*$/, "")}`;
  const headers = {
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    ...transport.headers,
  };
  let response: Response;
  try {
    response = await (transport.fetch ?? globalThis.fetch)(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    if (signal?.aborted) throw aborted(request, undefined, signal, message);
    throw fail(request, "network", undefined, "сервер не ответил", [message]);
  }
  // A4-22: a body that stops mid-way is a cut connection; after an abort (Cancel, grace) it is a timeout.
  const raw = await response.text().catch((failure: unknown) => {
    const message = failure instanceof Error ? failure.message : String(failure);
    if (signal?.aborted) throw aborted(request, response.status, signal, message);
    throw fail(request, "network", response.status, "ответ сервера оборвался", [message]);
  });
  const { json, value } = parse(raw);
  const { status } = response;
  // A 500 of /prompt and /action carries the fallback outcome as its body (SERVER-CONTRACT.md).
  const outcome500 =
    status === 500 &&
    (endpoint === "prompt" || endpoint === "action") &&
    field(value, "status") === "fallback";
  if (response.ok || outcome500) {
    if (!json) throw fail(request, "shape", status, "ответ сервера не JSON", [], raw);
    const problem = bodyProblem(endpoint, value);
    if (problem !== undefined)
      throw fail(request, problem.kind, status, problem.title, problem.details, raw);
    return value as T;
  }
  const message = field(value, "message") ?? field(value, "error");
  const detail = typeof message === "string" ? message : response.statusText;
  const served = field(value, "contractVersion") !== undefined;
  throw fail(request, "http", status, detail || "ошибка без описания", [], raw, served);
}
