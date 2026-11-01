import { validatePayload } from "@a2ui/agent";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { assertCompleteContract, contractProblems } from "../src/contract-checks.ts";
import { readExamples } from "../scripts/examples.ts";
import { componentProps } from "../src/contract-view.ts";
import { propDoc, type PropDoc } from "../src/docs/prop-docs.ts";
import { COMPONENT_APIS, TWO_WAY_BINDINGS, uiKitOneContract } from "../src/index.ts";
import { PROP_KINDS, STYLE_NOTE, prop } from "../src/prop-kinds.ts";

const shapeOf = (schema: unknown) =>
  (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
const allProps = COMPONENT_APIS.flatMap(componentProps);
const docs = (props: readonly PropDoc[], owner: string): Array<[string, PropDoc]> =>
  props.flatMap((p) => [[`${owner}.${p.name}`, p], ...docs(p.items ?? [], `${owner}.${p.name}[]`)]);

/** The schema shapes each kind may have (common type ref, or the zod type of a literal prop). */
const KIND_SHAPES: Record<keyof typeof PROP_KINDS, RegExp> = {
  style: /^enum$/,
  option: /^(enum|boolean|integer|number|string|array of objects)$/,
  content: /^Dynamic(String|Boolean|Number|Value)$/,
  "two-way": /^Dynamic(String|Boolean|Number)$/,
  child: /^(ChildList|ComponentId|array of objects)$/,
  trigger: /^ComponentId$/,
  action: /^Action$/,
  checks: /^array of objects$/,
};

describe("prop kinds [SV-C22]", () => {
  it("give every prop of every component exactly one kind", () => {
    for (const api of COMPONENT_APIS)
      expect(componentProps(api).map((p) => p.name)).toEqual(Object.keys(shapeOf(api.schema)));
    expect(allProps.length).toBeGreaterThan(100);
  });

  it("match the prop's schema (style = token enum, content = dynamic type, …)", () => {
    for (const api of COMPONENT_APIS) {
      for (const p of componentProps(api)) {
        const doc = propDoc(p.name, shapeOf(api.schema)[p.name] as z.ZodTypeAny);
        expect(doc.type, `${api.name}.${p.name} (${p.kind})`).toMatch(KIND_SHAPES[p.kind]);
        expect(p.group !== undefined, `${api.name}.${p.name} group`).toBe(p.kind === "style");
      }
    }
  });

  it("derive the two-way bindings", () => {
    expect(TWO_WAY_BINDINGS).toEqual({
      Input: ["value"],
      Checkbox: ["value"],
      RadioGroup: ["value"],
      Switch: ["value"],
      Modal: ["open"],
      Tabs: ["selectedIndex"],
    });
  });
});

describe("style props [SV-C21]", () => {
  const style = allProps.filter((p) => p.kind === "style");

  it("say in their description that they take a literal token only", () => {
    for (const p of style) {
      const api = COMPONENT_APIS.find((candidate) => candidate.name === p.component);
      const doc = propDoc(p.name, shapeOf(api?.schema)[p.name] as z.ZodTypeAny);
      expect(doc.description, `${p.component}.${p.name}`).toContain(STYLE_NOTE);
    }
  });

  /** The component's own validated example with `prop` of its first `component` node set to `value`. */
  const withProp = (component: string, prop: string, value: unknown) => {
    const example = readExamples("components").find(
      (e) => e.name === component || e.file === `${component}.json`,
    );
    const messages = structuredClone(example?.messages ?? []) as Array<Record<string, any>>;
    const node = messages
      .flatMap((m) => (m.updateComponents?.components ?? []) as Array<Record<string, unknown>>)
      .find((c) => c.component === component);
    if (node === undefined) throw new Error(`no ${component} in its example`);
    node[prop] = value;
    return messages;
  };
  const valid = (messages: unknown[]) => {
    try {
      validatePayload([uiKitOneContract], messages);
      return true;
    } catch {
      return false;
    }
  };

  it("reject data bindings and function calls; every literal token of the prop is accepted", () => {
    const call = { call: "formatString", args: { value: "${/tone}" } };
    expect(style.length).toBeGreaterThan(50);
    for (const p of style) {
      const label = `${p.component}.${p.name}`;
      expect(p.values.length, label).toBeGreaterThan(0);
      for (const token of p.values)
        expect(valid(withProp(p.component, p.name, token)), `${label} = ${token}`).toBe(true);
      for (const value of [{ path: "/tone" }, call, "not-a-token"])
        expect(
          valid(withProp(p.component, p.name, value)),
          `${label} = ${JSON.stringify(value)}`,
        ).toBe(false);
    }
  });
});

describe("component documentation [SV-C22]", () => {
  it("describes every prop and every item field of every component", () => {
    for (const api of COMPONENT_APIS) {
      expect(api.schema.description ?? "", api.name).not.toBe("");
      const props = Object.entries(shapeOf(api.schema)).map(([name, schema]) =>
        propDoc(name, schema),
      );
      for (const [label, doc] of docs(props, api.name))
        expect(doc.description.trim(), label).not.toBe("");
    }
  });

  it("has at least one example per component that uses it and validates", () => {
    const examples = [...readExamples("components"), ...readExamples("compositions")];
    for (const api of COMPONENT_APIS) {
      const using = examples.filter((example) =>
        JSON.stringify(example.messages).includes(`"component":"${api.name}"`),
      );
      expect(using.length, api.name).toBeGreaterThan(0);
      for (const example of using)
        expect(
          () => validatePayload([uiKitOneContract], example.messages),
          example.file,
        ).not.toThrow();
    }
  });
});

describe("half-described components are rejected [DEC-034]", () => {
  const fixture = (shape: Record<string, z.ZodTypeAny>, description = "A fixture.") =>
    ({ name: "Fixture", schema: z.object(shape).describe(description).strict() }) as never;

  it("the real contract is complete", () => {
    expect(contractProblems(COMPONENT_APIS)).toEqual([]);
  });

  it("reports a prop without a kind and a prop without a description", () => {
    const problems = contractProblems([
      fixture({
        untagged: z.string().describe("Has a description but no kind.").optional(),
        mute: prop.content(z.string().optional()),
      }),
    ]);
    expect(problems).toEqual(["Fixture.untagged: no prop kind", "Fixture.mute: no description"]);
    expect(() => assertCompleteContract([fixture({ x: z.string() }, "")])).toThrow(
      /Fixture: no description\nFixture.x: no prop kind\nFixture.x: no description/,
    );
  });
});
