import modalExample from "@agentic-ui/ui-kit-one-catalog/examples/components/Modal.json" with { type: "json" };
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { UI_KIT_ROOT_ATTRIBUTE } from "../src/index.ts";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { renderMessages } from "./support/render-messages.tsx";

describe("UiKitProvider scoped mode [PG-06]", () => {
  failOnConsoleNoise();

  it("portals the open Modal inside the kit root and leaves html/body untouched", async () => {
    renderMessages(modalExample.messages, { mode: "scoped" });
    await userEvent.click(screen.getByRole("button", { name: "Показать детали" }));
    const dialog = await screen.findByRole("dialog");
    const root = document.querySelector(`[${UI_KIT_ROOT_ATTRIBUTE}]`);
    expect(root?.contains(dialog)).toBe(true);
    expect(document.body.className).toBe("");
    expect(document.body.getAttribute("style")).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("emits Chakra CSS variables on the kit root instead of :root", () => {
    renderMessages(modalExample.messages, { mode: "scoped" });
    const css = [...document.querySelectorAll("style")]
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(css).toContain(`[${UI_KIT_ROOT_ATTRIBUTE}]{--chakra-`);
    expect(css).not.toMatch(/(:root|\[data-theme\])[^{]*{[^}]*--chakra-/);
    expect(css).toContain("--chakra-colors-whiteAlpha-400");
    expect(css).not.toContain("whiteAlpha.400");
  });
});
