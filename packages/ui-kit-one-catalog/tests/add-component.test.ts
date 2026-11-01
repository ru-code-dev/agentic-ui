import { validatePayload } from "@a2ui/agent";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { buildCatalogJson, CATALOG_ID, createContract } from "../src/index.ts";
import { assembleSystemPrompt } from "../src/prompt/index.ts";
import { SliderApi, withSlider } from "./support/slider.ts";

const payload = [
  {
    version: "v0.9",
    createSurface: { surfaceId: "s", catalogId: CATALOG_ID, sendDataModel: true },
  },
  { version: "v0.9", updateDataModel: { surfaceId: "s", path: "/", value: { volume: 3 } } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "s",
      components: [
        { id: "root", component: "Slider", label: "Громкость", value: { path: "/volume" } },
      ],
    },
  },
];

describe("adding a component touches only its schema and registration [DEC-034, DEC-036]", () => {
  const contract = createContract(withSlider);
  const json = buildCatalogJson(contract);
  const prompt = assembleSystemPrompt(json).text;

  it("appears in catalog.json", () => {
    expect(Object.keys(json.components as object)).toContain("Slider");
    expect(JSON.stringify(json.components)).toContain('"description":"A fixture slider."');
  });

  it("appears in the generated rules and Interactions", () => {
    const instructions = String(json.instructions);
    expect(instructions).toContain("checks on Button, Input, Checkbox, RadioGroup, Slider");
    expect(instructions.split("Interactions:")[1]).toContain("Slider.value");
  });

  it("appears in the system prompt (schema and rules)", () => {
    expect(prompt).toContain('"Slider":{');
    expect(prompt).toContain("Tabs.selectedIndex, Slider.value)");
  });

  it("validates payloads that use it, and only with the fixture contract", () => {
    expect(() => validatePayload([contract], payload)).not.toThrow();
    expect(() =>
      validatePayload(
        [createContract({ ...withSlider, components: withSlider.components.slice(0, -1) })],
        payload,
      ),
    ).toThrow();
  });

  it("cannot be registered without a role", () => {
    const { Slider: _, ...roles } = withSlider.roles;
    expect(() => createContract({ ...withSlider, roles })).toThrow(/No role .*: Slider/);
  });

  it("cannot be registered half-described", () => {
    const bare = {
      name: "Slider",
      schema: z.object({ ...SliderApi.schema.shape, extra: z.string() }).describe("x"),
    };
    expect(() =>
      createContract({
        ...withSlider,
        components: [...withSlider.components.slice(0, -1), bare as never],
      }),
    ).toThrow(/Slider.extra: no prop kind/);
  });
});
