import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { components, surface } from "./support/messages.ts";
import { renderMessages } from "./support/render-messages.tsx";

const emittedCss = () =>
  [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n");

const grid = (props: object) => [
  surface("g"),
  components("g", [
    { id: "root", component: "Grid", gap: "4", children: ["a", "b"], ...props },
    { id: "a", component: "Text", text: "Счёт" },
    { id: "b", component: "Text", text: "Карта" },
  ]),
];

describe("layout", () => {
  failOnConsoleNoise();

  it("Grid columns render a fixed count of equal tracks", () => {
    renderMessages(grid({ columns: 3 }));
    expect(screen.getByText("Карта")).toBeTruthy();
    expect(emittedCss()).toContain("repeat(3, minmax(0, 1fr))");
  });

  it("Grid minChildWidth resolves the size token into auto-fit tracks", () => {
    renderMessages(grid({ minChildWidth: "3xs" }));
    expect(screen.getByText("Счёт")).toBeTruthy();
    expect(emittedCss()).toContain("repeat(auto-fit, minmax(14rem, 1fr))");
  });
});
