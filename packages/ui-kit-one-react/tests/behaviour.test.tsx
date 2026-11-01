/**
 * DEC-041 / DEC-044: per-component behaviour tests generated from the contract's prop kinds.
 * Every `two-way`, `action` and `trigger` prop of the catalog becomes one case, run on that
 * component's own snippet (examples/components) through the real runtime and provider:
 * two-way props must write the user's change into the data model, actions must reach the
 * transport as events, triggers must open their component. The user gesture for each prop lives
 * in GESTURES; a new behaviour prop without a gesture (or without a snippet) fails the suite.
 */
import { COMPONENT_APIS, propsOfKind, type PropView } from "@agentic-ui/ui-kit-one-catalog";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { renderMessages } from "./support/render-messages.tsx";

type Node = Record<string, unknown> & { id: string; component: string };
interface Message {
  updateComponents?: { surfaceId: string; components: Node[] };
}

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../ui-kit-one-catalog/examples/components",
);
const snippets = new Map(
  readdirSync(dir).map((file) => {
    const example = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
      name: string;
      messages: Message[];
    };
    return [example.name, example.messages] as const;
  }),
);

/** The behaviour props of the contract, generated from the prop kinds (SV-C22). */
const BEHAVIOUR = (["two-way", "action", "trigger"] as const).flatMap((kind) =>
  propsOfKind(COMPONENT_APIS, kind),
);

interface Case {
  readonly prop: PropView;
  /** The snippet's node of the component under test. */
  readonly node: Node;
  readonly nodes: readonly Node[];
  /** Data-model path of a two-way prop (the snippet's binding, else a fresh one). */
  readonly path: string;
  readonly dataModel: (path: string) => unknown;
  readonly lastEvent: () => string | undefined;
  readonly user: ReturnType<typeof userEvent.setup>;
}

/** A literal text, or the data-model value a binding points to. */
const text = (c: Case, value: unknown): string =>
  typeof value === "object" && value !== null && "path" in value
    ? String(c.dataModel(String(value.path)))
    : String(value);

const labelled = (c: Case, value: unknown) =>
  screen.getByLabelText(text(c, value), { exact: false });

async function pressTrigger(c: Case) {
  const trigger = c.nodes.find((node) => node.id === c.node["trigger"]);
  await c.user.click(screen.getByRole("button", { name: text(c, trigger?.["label"]) }));
}

async function toggle(c: Case) {
  const before = c.dataModel(c.path) === true;
  await c.user.click(labelled(c, c.node["label"]));
  expect(c.dataModel(c.path)).toBe(!before);
}

/** The user gesture and the observable result, per behaviour prop (`Component.prop`). */
const GESTURES: Record<string, (c: Case) => Promise<void>> = {
  "Input.value": async (c) => {
    const field = labelled(c, c.node["label"]);
    await c.user.clear(field);
    await c.user.type(field, "anna@bank.ru");
    expect(c.dataModel(c.path)).toBe("anna@bank.ru");
  },
  "Checkbox.value": toggle,
  "Switch.value": toggle,
  "RadioGroup.value": async (c) => {
    const options = c.node["options"] as { label: string; value: string }[];
    const other = options.find((option) => option.value !== c.dataModel(c.path));
    await c.user.click(screen.getByRole("radio", { name: String(other?.label) }));
    expect(c.dataModel(c.path)).toBe(other?.value);
  },
  "Tabs.selectedIndex": async (c) => {
    const tabs = c.node["tabs"] as { title: unknown }[];
    await c.user.click(screen.getByRole("tab", { name: text(c, tabs[1]?.title) }));
    expect(c.dataModel(c.path)).toBe(1);
  },
  "Modal.open": async (c) => {
    expect(c.dataModel(c.path)).not.toBe(true);
    await pressTrigger(c);
    expect(c.dataModel(c.path)).toBe(true);
  },
  "Modal.trigger": async (c) => {
    expect(screen.queryByRole("dialog")).toBeNull();
    await pressTrigger(c);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  },
  "Button.action": async (c) => {
    await c.user.click(screen.getByRole("button", { name: text(c, c.node["label"]) }));
    const action = c.node["action"] as { event: { name: string } };
    expect(c.lastEvent()).toBe(action.event.name);
  },
};

/** The component's snippet; a two-way prop the snippet leaves unbound is bound to a fresh path. */
function fixture(prop: PropView) {
  const messages = structuredClone(snippets.get(prop.component) ?? []);
  const update = messages.find((message) => message.updateComponents)?.updateComponents;
  const node = update?.components.find((candidate) => candidate.component === prop.component);
  if (update === undefined || node === undefined) return undefined;
  let path = "";
  if (prop.kind === "two-way") {
    const bound = node[prop.name] as { path?: unknown } | undefined;
    if (typeof bound?.path !== "string") node[prop.name] = { path: `/behaviour/${prop.name}` };
    path = String((node[prop.name] as { path: string }).path);
  }
  return { messages, surfaceId: update.surfaceId, node, nodes: update.components, path };
}

describe("generated behaviour tests from prop kinds [P8-behaviour-tests, PR-02, INT-08]", () => {
  failOnConsoleNoise();

  it("cover every two-way, action and trigger prop of the contract", () => {
    const labels = BEHAVIOUR.map((prop) => `${prop.component}.${prop.name}`);
    expect(labels.length).toBeGreaterThanOrEqual(8);
    expect(
      labels.filter((label) => !(label in GESTURES)),
      "add a gesture per new behaviour prop to GESTURES in packages/ui-kit-one-react/tests/behaviour.test.tsx",
    ).toEqual([]);
    expect(
      BEHAVIOUR.filter((prop) => fixture(prop) === undefined),
      "add packages/ui-kit-one-catalog/examples/components/<Name>.json using the component",
    ).toEqual([]);
    expect(Object.keys(GESTURES).filter((label) => !labels.includes(label))).toEqual([]);
  });

  for (const prop of BEHAVIOUR) {
    it(`${prop.component}.${prop.name} (${prop.kind}) works in the ${prop.component} snippet`, async () => {
      const built = fixture(prop);
      if (built === undefined) throw new Error(`no ${prop.component} snippet`);
      const { dataModel, sent } = renderMessages(built.messages);
      await GESTURES[`${prop.component}.${prop.name}`]?.({
        prop,
        node: built.node,
        nodes: built.nodes,
        path: built.path,
        dataModel: (path) => dataModel(built.surfaceId, path),
        lastEvent: () => sent.at(-1)?.action.name,
        user: userEvent.setup(),
      });
    });
  }
});
