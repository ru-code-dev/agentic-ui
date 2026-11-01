import { COMPONENT_APIS, componentProps } from "@agentic-ui/ui-kit-one-catalog";
import { screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { renderMessages } from "./support/render-messages.tsx";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../ui-kit-one-catalog/examples/components",
);
const snippets = readdirSync(dir).map(
  (file) =>
    JSON.parse(readFileSync(join(dir, file), "utf8")) as { name: string; messages: unknown[] },
);

type Node = Record<string, unknown> & { component: string };

/** Literal strings of the content props of every component in `messages` (the text a snippet must show). */
function literalContent(messages: readonly unknown[]): string[] {
  const nodes = messages.flatMap(
    (message) =>
      (message as { updateComponents?: { components: Node[] } }).updateComponents?.components ?? [],
  );
  return nodes.flatMap((node) => {
    const api = COMPONENT_APIS.find((candidate) => candidate.name === node.component);
    const content =
      api === undefined ? [] : componentProps(api).filter((p) => p.kind === "content");
    return content
      .map((p) => node[p.name])
      .filter((value): value is string => typeof value === "string");
  });
}

/** Every text node and attribute value of the page: where a literal content string can show up. */
const visibleStrings = () =>
  [
    document.body.textContent ?? "",
    ...[...document.body.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].map((attribute) => attribute.value),
    ),
  ].join("\n");

/**
 * Stronger checks for the shipped snippets (by accessible role or text). Optional: a new component's snippet is
 * covered by the generic check (it renders, with no console noise, and shows its literal content).
 */
const EXPECTED: Record<string, () => void> = {
  Box: () => screen.getByRole("heading", { name: "Накопительный счёт" }),
  Center: () => expect(document.querySelector("svg")).not.toBeNull(),
  Container: () => screen.getByRole("heading", { level: 1, name: "Мои финансы" }),
  Flex: () => screen.getByText("184 250,50 ₽"),
  Grid: () => screen.getByText("87 450,00 ₽"),
  Heading: () => screen.getByRole("heading", { level: 1, name: "Мои счета" }),
  Text: () => screen.getByText("Добро пожаловать в интернет-банк"),
  Button: () => screen.getByRole("button", { name: "Перевести деньги" }),
  Input: () => screen.getByRole("textbox", { name: /Электронная почта/ }),
  Checkbox: () =>
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Запомнить меня на этом устройстве",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true),
  RadioGroup: () =>
    expect((screen.getByRole("radio", { name: "Курьером" }) as HTMLInputElement).checked).toBe(
      true,
    ),
  Switch: () =>
    expect(
      (screen.getByRole("checkbox", { name: "Уведомления о платежах" }) as HTMLInputElement)
        .checked,
    ).toBe(true),
  List: () =>
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Кешбэк до 5% на всё",
      "Бесплатное обслуживание",
      "Переводы без комиссии",
    ]),
  Table: () => screen.getByRole("gridcell", { name: /^95\s000,00\s₽$/ }),
  Tag: () => screen.getByText("Исполнен"),
  Modal: () => screen.getByRole("button", { name: "Показать детали" }),
  Tabs: () =>
    expect(screen.getByRole("tab", { name: "Обзор" }).getAttribute("aria-selected")).toBe("true"),
  Avatar: () => screen.getByRole("img", { name: "Анна Смирнова" }),
  Icon: () => expect(document.querySelector("svg[aria-hidden='true']")).not.toBeNull(),
};

describe("every component snippet renders through the renderer [INT-06, PR-01]", () => {
  failOnConsoleNoise();

  it("has one snippet per contract component", () => {
    expect(snippets.map((snippet) => snippet.name).toSorted()).toEqual(
      COMPONENT_APIS.map((api) => api.name).toSorted(),
    );
  });

  for (const snippet of snippets) {
    it(`renders ${snippet.name}`, () => {
      const { view } = renderMessages(snippet.messages);
      expect(view.container.querySelector("*"), `${snippet.name} renders nothing`).not.toBeNull();
      // At least one literal content string is on the page (a closed Modal hides its own title, not its trigger).
      const texts = literalContent(snippet.messages);
      const shown = visibleStrings();
      if (texts.length > 0)
        expect(
          texts.filter((text) => shown.includes(text)),
          `${snippet.name} shows none of ${texts.join(" | ")}`,
        ).not.toEqual([]);
      EXPECTED[snippet.name]?.();
    });
  }
});
