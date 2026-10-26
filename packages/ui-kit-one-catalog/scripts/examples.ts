import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface ExampleFile {
  readonly file: string;
  readonly name: string;
  readonly description: string;
  readonly messages: readonly Record<string, unknown>[];
}

const examplesRoot = new URL("../examples/", import.meta.url);

/** Reads every example of `kind`, sorted by file name. */
export function readExamples(kind: "components" | "compositions"): ExampleFile[] {
  const dir = new URL(`${kind}/`, examplesRoot);
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  return files.toSorted().map((file) => {
    const example = JSON.parse(readFileSync(fileURLToPath(new URL(file, dir)), "utf8")) as Omit<
      ExampleFile,
      "file"
    >;
    return {
      file: `${kind}/${file}`,
      name: example.name,
      description: example.description,
      messages: example.messages,
    };
  });
}

export interface MockRuleFile {
  readonly file: string;
  /** Action event name the rule answers. */
  readonly event: string;
  /** Messages applied as the simulated agent reply. */
  readonly messages: readonly Record<string, unknown>[];
}

/** Reads every mock-rule preset (`examples/mock-rules/*.json`), sorted by file name. */
export function readMockRules(): MockRuleFile[] {
  const dir = new URL("mock-rules/", examplesRoot);
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .toSorted()
    .map((file) => {
      const rule = JSON.parse(readFileSync(fileURLToPath(new URL(file, dir)), "utf8")) as Omit<
        MockRuleFile,
        "file"
      >;
      return { file: `mock-rules/${file}`, event: rule.event, messages: rule.messages };
    });
}
