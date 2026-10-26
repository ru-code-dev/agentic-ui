import { COMPONENT_APIS } from "@agentic-ui/ui-kit-one-catalog";
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

/** What each snippet must show (by accessible role or text). */
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

describe("every component snippet renders through the renderer", () => {
  failOnConsoleNoise();

  it("has one snippet per contract component", () => {
    expect(snippets.map((snippet) => snippet.name).toSorted()).toEqual(
      COMPONENT_APIS.map((api) => api.name).toSorted(),
    );
  });

  for (const snippet of snippets) {
    it(`renders ${snippet.name}`, () => {
      renderMessages(snippet.messages);
      EXPECTED[snippet.name]?.();
      expect(EXPECTED[snippet.name]).toBeDefined();
    });
  }
});
