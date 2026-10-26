/** The first JSON syntax error in a text: where it is and what was expected. */
export interface JsonSyntaxError {
  readonly offset: number;
  readonly message: string;
}

class Failure extends Error {
  readonly offset: number;

  constructor(offset: number, message: string) {
    super(message);
    this.offset = offset;
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const describe = (char: string | undefined) => (char === undefined ? "end of input" : `'${char}'`);

/**
 * Finds the first syntax error of `text` as JSON (V8's JSON.parse messages no longer carry a
 * position). Returns undefined for valid JSON.
 */
export function findJsonSyntaxError(text: string): JsonSyntaxError | undefined {
  let i = 0;
  const fail = (message: string): never => {
    throw new Failure(i, message);
  };
  const whitespace = () => {
    while (i < text.length && " \t\n\r".includes(text[i] as string)) i += 1;
  };
  const string = () => {
    i += 1;
    while (i < text.length) {
      const char = text[i] as string;
      if (char === '"') {
        i += 1;
        return;
      }
      if (char === "\\") i += text[i + 1] === "u" ? 6 : 2;
      else if (char < " ") fail("Unescaped control character in string");
      else i += 1;
    }
    fail("Unterminated string");
  };
  const literal = (word: string) =>
    text.startsWith(word, i) ? (i += word.length) : fail(`Unexpected ${describe(text[i])}`);
  const container = (close: "}" | "]") => {
    i += 1;
    whitespace();
    if (text[i] === close) {
      i += 1;
      return;
    }
    for (;;) {
      whitespace();
      if (close === "}") {
        if (text[i] !== '"') fail(`Expected a property name, found ${describe(text[i])}`);
        string();
        whitespace();
        if (text[i] !== ":") fail(`Expected ':', found ${describe(text[i])}`);
        i += 1;
      }
      value();
      whitespace();
      if (text[i] === ",") i += 1;
      else if (text[i] === close) {
        i += 1;
        return;
      } else fail(`Expected ',' or '${close}', found ${describe(text[i])}`);
    }
  };
  const value = (): void => {
    whitespace();
    const char = text[i];
    if (char === "{") return container("}");
    if (char === "[") return container("]");
    if (char === '"') return string();
    if (char === "t") return void literal("true");
    if (char === "f") return void literal("false");
    if (char === "n") return void literal("null");
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(text);
    if (number === null) fail(`Unexpected ${describe(char)}`);
    i += number?.[0].length ?? 0;
  };
  try {
    value();
    whitespace();
    if (i < text.length) fail(`Unexpected ${describe(text[i])} after the JSON value`);
    return undefined;
  } catch (error) {
    if (error instanceof Failure) return { offset: error.offset, message: error.message };
    throw error;
  }
}
