import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { onComponentError, type ComponentError } from "../src/index.ts";
import { renderMessages } from "./support/render-messages.tsx";

const CATALOG = "urn:agentic-ui:catalog:ui-kit-one:v1";
const surface = (components: object[], data: unknown) => [
  { version: "v0.9", createSurface: { surfaceId: "s", catalogId: CATALOG } },
  {
    version: "v0.9",
    updateComponents: {
      surfaceId: "s",
      components: [
        {
          id: "root",
          component: "Flex",
          direction: "column",
          children: components.map((c) => (c as { id: string }).id),
        },
        ...components,
      ],
    },
  },
  { version: "v0.9", updateDataModel: { surfaceId: "s", path: "/", value: data } },
];

describe("a bound value of another type fails only its own component [A4-26]", () => {
  it("Button label bound to an object and Avatar name bound to a number: placeholders, the rest renders", () => {
    const errors: ComponentError[] = [];
    const stop = onComponentError((error) => errors.push(error));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    renderMessages(
      surface(
        [
          { id: "title", component: "Text", text: "Итого" },
          {
            id: "pay",
            component: "Button",
            label: { path: "/label" },
            action: { event: { name: "go" } },
          },
          { id: "who", component: "Avatar", name: { path: "/name" } },
          { id: "after", component: "Text", text: "Ниже всё на месте" },
        ],
        { label: { text: "объект" }, name: 42 },
      ),
    );
    quiet.mockRestore();
    stop();
    expect(screen.getByText("Итого")).toBeTruthy();
    expect(screen.getByText("Ниже всё на месте")).toBeTruthy();
    const failed = screen.getAllByTestId("component-failed");
    expect(failed.map((node) => node.getAttribute("data-component")).toSorted()).toEqual([
      "Avatar",
      "Button",
    ]);
    expect(failed.map((node) => node.textContent).join(" ")).toMatch(/«pay» не отрисован/);
    expect(errors.map((error) => `${error.component} ${error.id}`).toSorted()).toEqual([
      "Avatar who",
      "Button pay",
    ]);
    // PKG-A-O2: the error names its surface (a listener scopes itself by identity)
    expect(errors.map((error) => (error.surface as { id?: string } | undefined)?.id)).toEqual([
      "s",
      "s",
    ]);
  });
});
