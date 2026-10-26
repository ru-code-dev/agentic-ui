import { findJsonSyntaxError } from "./json-syntax.ts";
import { positionAt, type SourcePosition } from "./source-position.ts";

/** How the editor content was recognized (PG-04). */
export type InputFormat = "array" | "jsonl" | "message" | "example" | "wrapper";

export interface SourceError extends SourcePosition {
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly messages: readonly unknown[]; readonly format: InputFormat }
  | { readonly ok: false; readonly error: SourceError };

const MESSAGE_KEYS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isMessage = (value: unknown) => isRecord(value) && MESSAGE_KEYS.some((key) => key in value);

/** The syntax error of `text` as a SourceError (line numbers shifted by `lineOffset`). */
function syntaxError(text: string, lineOffset = 0): SourceError {
  const found = findJsonSyntaxError(text) ?? { offset: text.length, message: "Invalid JSON" };
  const position = positionAt(text, found.offset);
  return { message: found.message, line: position.line + lineOffset, column: position.column };
}

function classify(value: unknown): ParseResult {
  if (Array.isArray(value)) return { ok: true, messages: value, format: "array" };
  if (isRecord(value) && Array.isArray(value.messages)) {
    return { ok: true, messages: value.messages, format: "name" in value ? "example" : "wrapper" };
  }
  if (isMessage(value)) return { ok: true, messages: [value], format: "message" };
  return {
    ok: false,
    error: {
      message: "Expected A2UI messages: an array, JSONL, one message, or { messages: [...] }",
      line: 1,
      column: 1,
    },
  };
}

function parseJsonl(source: string): ParseResult {
  const messages: unknown[] = [];
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      return { ok: false, error: syntaxError(line, index) };
    }
  }
  return { ok: true, messages, format: "jsonl" };
}

/** Parses editor content in any supported format; errors carry 1-based line/column. */
export function parseMessages(source: string): ParseResult {
  if (source.trim() === "")
    return { ok: false, error: { message: "The editor is empty", line: 1, column: 1 } };
  try {
    return classify(JSON.parse(source));
  } catch {
    const lines = source.split("\n").filter((line) => line.trim() !== "");
    const firstLineIsMessage = (() => {
      try {
        return isMessage(JSON.parse(lines[0] ?? ""));
      } catch {
        return false;
      }
    })();
    if (lines.length > 1 && firstLineIsMessage) return parseJsonl(source);
    return { ok: false, error: syntaxError(source) };
  }
}
