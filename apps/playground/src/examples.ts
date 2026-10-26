export interface Example {
  readonly id: string;
  readonly kind: "composition" | "component";
  readonly name: string;
  readonly description: string;
  readonly messages: readonly unknown[];
}

export interface MockRulePreset {
  readonly id: string;
  readonly event: string;
  readonly messages: readonly unknown[];
}

type ExampleFile = Omit<Example, "id" | "kind">;
type RuleFile = Omit<MockRulePreset, "id">;

const root = "../../../packages/ui-kit-one-catalog/examples";
const compositionFiles = import.meta.glob<ExampleFile>(
  "../../../packages/ui-kit-one-catalog/examples/compositions/*.json",
  { eager: true, import: "default" },
);
const componentFiles = import.meta.glob<ExampleFile>(
  "../../../packages/ui-kit-one-catalog/examples/components/*.json",
  { eager: true, import: "default" },
);
const ruleFiles = import.meta.glob<RuleFile>(
  "../../../packages/ui-kit-one-catalog/examples/mock-rules/*.json",
  { eager: true, import: "default" },
);

const idOf = (path: string, folder: string) =>
  path.replace(`${root}/${folder}/`, "").replace(/\.json$/, "");
const sorted = <T>(files: Record<string, T>) =>
  Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b));
const toExample = (file: ExampleFile, id: string, kind: Example["kind"]): Example => ({
  id,
  kind,
  name: file.name,
  description: file.description,
  messages: file.messages,
});

/** The 20 compositions (EX-01..20), in file order. */
export const compositions: readonly Example[] = sorted(compositionFiles).map(([path, file]) =>
  toExample(file, idOf(path, "compositions"), "composition"),
);

/** The 19 component snippets, in alphabetical order. */
export const componentExamples: readonly Example[] = sorted(componentFiles).map(([path, file]) =>
  toExample(file, idOf(path, "components"), "component"),
);

/** Mock-rule presets (event → simulated agent reply). */
export const mockRulePresets: readonly MockRulePreset[] = sorted(ruleFiles).map(([path, file]) => ({
  id: idOf(path, "mock-rules"),
  event: file.event,
  messages: file.messages,
}));

export const findExample = (id: string | undefined): Example | undefined =>
  [...compositions, ...componentExamples].find((example) => example.id === id);
