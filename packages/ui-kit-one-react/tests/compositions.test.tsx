import { screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { renderMessages } from "./support/render-messages.tsx";

const examples = join(dirname(fileURLToPath(import.meta.url)), "../../ui-kit-one-catalog/examples");
const read = <T extends object>(folder: string): Array<T & { file: string }> =>
  readdirSync(join(examples, folder))
    .toSorted()
    .map((file) =>
      Object.assign(JSON.parse(readFileSync(join(examples, folder, file), "utf8")) as T, { file }),
    );

const compositions = read<{ name: string; messages: unknown[] }>("compositions");
const mockRules = read<{ event: string; messages: unknown[] }>("mock-rules");

/** The surface id a set of messages targets. */
const surfaceOf = (messages: readonly unknown[]) =>
  JSON.stringify(messages).match(/"surfaceId":"([^"]+)"/)?.[1];

describe("every composition renders through the renderer [INT-06, EX-01..24, PR-01]", () => {
  failOnConsoleNoise();

  for (const composition of compositions) {
    it(`renders ${composition.file}`, () => {
      renderMessages(composition.messages);
      expect(screen.queryByText(/Unknown component/)).toBeNull();
      expect(
        screen.queryAllByRole("heading").length + screen.queryAllByRole("button").length,
      ).toBeGreaterThan(0);
    });
  }

  it("formats nested money expressions (pricing)", () => {
    renderMessages(compositions.find((c) => c.file === "08-pricing.json")?.messages ?? []);
    expect(screen.getByText("299 ₽ в месяц")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
  });

  for (const rule of mockRules) {
    it(`applies the ${rule.file} reply to its composition`, () => {
      const composition = compositions.find(
        (c) => surfaceOf(c.messages) === surfaceOf(rule.messages),
      );
      expect(composition, rule.file).toBeDefined();
      const { push, view } = renderMessages(composition?.messages ?? []);
      const before = view.container.textContent;
      push(rule.messages);
      expect(view.container.textContent).not.toBe(before);
    });
  }
});
