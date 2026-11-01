import { COMPONENT_APIS } from "@agentic-ui/ui-kit-one-catalog";
import { describe, expect, it } from "vite-plus/test";
import {
  COMPONENT_IMPLEMENTATIONS,
  COMPONENT_MAPPINGS,
  COMPONENT_REGISTRY,
  PASSTHROUGH,
  registeredFor,
} from "../src/index.ts";

describe("single component registry [DEC-036] (DEC-007)", () => {
  it("holds exactly the contract components; implementations and mappings derive from it", () => {
    expect(Object.keys(COMPONENT_REGISTRY).toSorted()).toEqual(
      COMPONENT_APIS.map((api) => api.name).toSorted(),
    );
    expect(COMPONENT_MAPPINGS.map((m) => m.component)).toEqual(
      COMPONENT_APIS.map((api) => api.name),
    );
    // each registry implementation, behind its per-component boundary (A4-26): same api, own render
    expect(COMPONENT_IMPLEMENTATIONS.map((impl) => impl.name)).toEqual(
      COMPONENT_APIS.map((api) => COMPONENT_REGISTRY[api.name]?.implementation.name),
    );
    COMPONENT_IMPLEMENTATIONS.forEach((impl, i) => {
      const entry = COMPONENT_REGISTRY[COMPONENT_APIS[i]!.name]!.implementation;
      expect(impl.schema).toBe(entry.schema);
      expect(impl.render.displayName).toBe(`Guarded(${entry.name})`);
    });
  });

  it("adding a pure-data component is one registry line (a PASSTHROUGH entry)", () => {
    const apis = [...COMPONENT_APIS, { name: "Slider" }];
    const slider = {
      ...PASSTHROUGH.Tag,
      mapping: { ...PASSTHROUGH.Tag.mapping, component: "Slider" },
    };
    const entries = registeredFor(apis, { ...COMPONENT_REGISTRY, Slider: slider });
    expect(entries.at(-1)).toBe(slider);
    expect(() => registeredFor(apis, COMPONENT_REGISTRY)).toThrow("Slider has no renderer entry");
    expect(() => registeredFor(COMPONENT_APIS, { ...COMPONENT_REGISTRY, Slider: slider })).toThrow(
      "not in the contract: Slider",
    );
  });
});
