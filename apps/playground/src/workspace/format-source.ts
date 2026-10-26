import { parseMessages } from "../editor/parse-messages.ts";

/**
 * Pretty-prints the editor content (Ctrl/Cmd+S): JSON with two-space indentation, JSONL one
 * message per line. Invalid content is returned unchanged.
 */
export function formatSource(source: string): string {
  const parsed = parseMessages(source);
  if (!parsed.ok) return source;
  if (parsed.format === "jsonl")
    return `${parsed.messages.map((message) => JSON.stringify(message)).join("\n")}\n`;
  return JSON.stringify(JSON.parse(source), null, 2);
}
