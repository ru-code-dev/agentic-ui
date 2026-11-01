import { validatePayload } from "@a2ui/agent";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vite-plus/test";
import { compileMessageValidator } from "../scripts/catalog-validator.ts";
import { readExamples } from "../scripts/examples.ts";
import { buildCatalogJson, CATALOG_ID, COMPONENT_APIS, uiKitOneContract } from "../src/index.ts";

const catalog = buildCatalogJson();
const validateMessage = compileMessageValidator(catalog);
const surface = { version: "v0.9", createSurface: { surfaceId: "s", catalogId: CATALOG_ID } };
/** The component under test, plus the child `a` when it refers to one (no dangling or orphan ids). */
const componentsMessage = (component: Record<string, unknown>) => {
  const child = JSON.stringify(component).includes('"a"')
    ? [{ id: "a", component: "Text", text: "Дочерний" }]
    : [];
  return {
    version: "v0.9",
    updateComponents: { surfaceId: "s", components: [{ id: "root", ...component }, ...child] },
  };
};
const required = (path: string) => ({
  condition: { call: "required", args: { value: { path } } },
  message: "Обязательно",
});

function runtimeAccepts(component: Record<string, unknown>): boolean {
  try {
    validatePayload([uiKitOneContract], [surface, componentsMessage(component)]);
    return true;
  } catch {
    return false;
  }
}

describe("catalog.json [INT-02, PR-01]", () => {
  it("uses the contract id as $id and catalogId and carries the catalog rules", () => {
    expect(catalog.$id).toBe(CATALOG_ID);
    expect(catalog.catalogId).toBe(CATALOG_ID);
    expect(catalog.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(catalog.instructions).toContain("ui-kit-one rules:");
  });

  it("is a valid JSON Schema 2020-12 document", () => {
    const ajv = new Ajv2020({ strict: false });
    expect(ajv.validateSchema(catalog), JSON.stringify(ajv.errors)).toBe(true);
  });

  it("declares every contract component (COMPONENT_APIS, in order), the 14 basic functions and the shared $defs [INT-01, DEC-036]", () => {
    expect(Object.keys(catalog.components as object)).toEqual(
      COMPONENT_APIS.map((api) => api.name),
    );
    expect(COMPONENT_APIS.length).toBeGreaterThan(0);
    expect(Object.keys(catalog.functions as object)).toHaveLength(14);
    expect(Object.keys(catalog.$defs as object)).toEqual(
      expect.arrayContaining(["StyleProps", "ColorProp", "anyComponent", "anyFunction", "theme"]),
    );
  });

  it("validates every message of every component snippet against the v0.9 envelope", () => {
    const examples = readExamples("components");
    expect(examples.map((example) => example.name).toSorted()).toEqual(
      COMPONENT_APIS.map((api) => api.name).toSorted(),
    );
    for (const example of examples) {
      for (const message of example.messages) {
        expect(
          validateMessage(message),
          `${example.file}: ${JSON.stringify(validateMessage.errors)}`,
        ).toBe(true);
      }
      expect(
        () => validatePayload([uiKitOneContract], example.messages),
        example.file,
      ).not.toThrow();
    }
  });

  const action = { event: { name: "ok" } };
  it.each([
    [
      "accepts",
      "a Button with checks and icons",
      true,
      { component: "Button", label: "Ок", action, leftIcon: "check", checks: [required("/name")] },
    ],
    [
      "accepts",
      "an Input with checks",
      true,
      {
        component: "Input",
        label: "Имя",
        value: { path: "/name" },
        type: "email",
        checks: [required("/name")],
      },
    ],
    [
      "accepts",
      "a Checkbox with checks",
      true,
      {
        component: "Checkbox",
        label: "Согласен",
        value: { path: "/ok" },
        checks: [required("/ok")],
      },
    ],
    [
      "accepts",
      "a RadioGroup with checks",
      true,
      {
        component: "RadioGroup",
        label: "Выбор",
        value: { path: "/v" },
        options: [{ label: "Курьером", value: "courier" }],
        checks: [required("/v")],
      },
    ],
    [
      "accepts",
      "a Box with style props",
      true,
      {
        component: "Box",
        p: "4",
        bg: "gray.700",
        borderRadius: "lg",
        shadow: "md",
        w: "full",
        children: ["a"],
      },
    ],
    [
      "accepts",
      "a Container with a container size",
      true,
      { component: "Container", maxW: "container.md", p: "4" },
    ],
    [
      "accepts",
      "a Text bound to the data model",
      true,
      {
        component: "Text",
        text: { path: "/title" },
        fontSize: "2xl",
        textAlign: "right",
        color: "gray.400",
      },
    ],
    [
      "accepts",
      "a Table bound to rows",
      true,
      {
        component: "Table",
        rows: { path: "/rows" },
        columns: [{ header: "Сумма", key: "amount", format: "currency", align: "right" }],
      },
    ],
    [
      "accepts",
      "Tabs with a bound selectedIndex",
      true,
      { component: "Tabs", tabs: [{ title: "А", child: "a" }], selectedIndex: { path: "/tab" } },
    ],
    ["rejects", "an unknown component", false, { component: "Slider" }],
    ["rejects", "a missing required prop", false, { component: "Text" }],
    ["rejects", "an undeclared prop (sx)", false, { component: "Box", sx: { color: "red" } }],
    ["rejects", "a raw CSS value", false, { component: "Box", p: "13px" }],
    [
      "rejects",
      "a value outside the token enum",
      false,
      { component: "Text", text: "Привет", fontSize: "huge" },
    ],
    [
      "rejects",
      "a CSS width instead of a size token",
      false,
      { component: "Container", maxW: "640px" },
    ],
    [
      "rejects",
      "a renamed prop (size instead of fontSize)",
      false,
      { component: "Text", text: "Привет", size: "lg" },
    ],
    [
      "accepts",
      "kit-valued Flex alignment",
      true,
      { component: "Flex", justify: "space-between", align: "flex-start", wrap: "wrap" },
    ],
    ["rejects", "a Button without action", false, { component: "Button", label: "Ок" }],
    ["rejects", "an unknown icon", false, { component: "Icon", name: "rocket" }],
    [
      "rejects",
      "an unknown table column format",
      false,
      {
        component: "Table",
        rows: { path: "/r" },
        columns: [{ header: "А", key: "a", format: "percent" }],
      },
    ],
    ["rejects", "a Grid with seven columns", false, { component: "Grid", columns: 7 }],
  ])("%s %s, in agreement with the runtime validator", (_verb, _case, valid, component) => {
    expect(
      validateMessage(componentsMessage(component)),
      JSON.stringify(validateMessage.errors),
    ).toBe(valid);
    expect(runtimeAccepts(component)).toBe(valid);
  });
});
