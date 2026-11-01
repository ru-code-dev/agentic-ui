import { DirectJsonParser } from "@a2ui/agent";
import { uiKitOneContract } from "@agentic-ui/ui-kit-one-catalog";

export interface Extraction {
  /** The prose outside the UI blocks (text parts joined by a blank line, as the reference server does). */
  readonly text: string;
  /** The messages of every readable `<a2ui-json>` block, in reply order (not validated: `validateMessages`). */
  readonly messages: readonly unknown[];
  /** One parse error per unreadable block (`@a2ui/agent` ParseError texts). */
  readonly errors: readonly string[];
}

const parser = new DirectJsonParser([uiKitOneContract]);
/**
 * @a2ui/agent 0.0.2's lexer keeps a module-global fence regex whose `lastIndex` can leak from one call into
 * the next (apps/agent-server/tests/agreement/parser-referee.mjs); lexing this first rewinds it, so every
 * reply is lexed as by a fresh module.
 */
const rewind = (length: number) =>
  parser.unwrap(`${"\n".repeat(length + 1)}\`\`\`\n{}\n</a2ui-json>`);

/**
 * SV-C26/SV-C27: a model reply → its text and A2UI messages (the reference server's extraction, the same
 * `DirectJsonParser`): for a host that talks to an LLM itself and renders through `useA2UISurfaces`.
 */
export function extractA2UI(reply: string): Extraction {
  rewind(reply.length);
  const texts: string[] = [];
  const messages: unknown[] = [];
  const errors: string[] = [];
  for (const part of parser.unwrap(reply)) {
    if (part.type === "text") {
      texts.push(part.text);
      continue;
    }
    try {
      messages.push(...parser.compile(part.a2uiRaw, part.isFinal));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { text: texts.join("\n\n"), messages, errors };
}
