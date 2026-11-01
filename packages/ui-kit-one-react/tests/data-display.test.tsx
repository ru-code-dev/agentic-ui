import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { formatCell } from "../src/format.ts";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { components, data, surface } from "./support/messages.ts";
import { renderMessages } from "./support/render-messages.tsx";

describe("data display [PR-01]", () => {
  failOnConsoleNoise();

  it("Table formats currency, numbers and declined dates in ru-RU and follows data updates", () => {
    const { push } = renderMessages([
      surface("t"),
      data("t", "/rows", [{ date: "2026-10-24", payee: "Пятёрочка", amount: -1840.5, qty: 12500 }]),
      components("t", [
        {
          id: "root",
          component: "Table",
          rows: { path: "/rows" },
          caption: "Операции",
          columns: [
            { header: "Дата", key: "date", format: "date" },
            { header: "Получатель", key: "payee" },
            { header: "Сумма", key: "amount", format: "currency", align: "right" },
            { header: "Баллы", key: "qty", format: "number" },
          ],
        },
      ]),
    ]);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Дата",
      "Получатель",
      "Сумма",
      "Баллы",
    ]);
    expect(
      screen.getAllByRole("gridcell").map((cell) => cell.textContent?.replaceAll("\u00a0", " ")),
    ).toEqual(["24 октября 2026 г.", "Пятёрочка", "-1 840,50 ₽", "12 500"]);
    expect(screen.getByText("Операции")).toBeTruthy();
    push([data("t", "/rows/1", { date: "2026-10-25", payee: "Зарплата", amount: 95000, qty: 0 })]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("Table cells with a locale Intl refuses (ru_RU) fall back to ru-RU instead of throwing [A3-13]", () => {
    // The contract refuses "ru_RU" (BCP 47 pattern); the fallback guards any tag Intl still rejects.
    expect(() => new Intl.NumberFormat("ru_RU")).toThrow(RangeError);
    const options = { locale: "ru_RU", currency: "RUB" };
    const cells = [
      formatCell("2026-10-24", "date", options),
      formatCell(1250, "currency", options),
      formatCell(12500, "number", options),
    ];
    expect(cells.map((cell) => cell.replaceAll("\u00a0", " "))).toEqual([
      "24 октября 2026 г.",
      "1 250,00 ₽",
      "12 500",
    ]);
  });

  it("List repeats its template over a data-model array and grows when an item is added", () => {
    const { push } = renderMessages([
      surface("l"),
      data("l", "/users", [{ name: "Анна" }, { name: "Борис" }]),
      components("l", [
        {
          id: "root",
          component: "List",
          variant: "ordered",
          children: { componentId: "row", path: "/users" },
        },
        { id: "row", component: "Text", text: { path: "name" } },
      ]),
    ]);
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Анна",
      "Борис",
    ]);
    push([data("l", "/users/2", { name: "Вера" })]);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Анна",
      "Борис",
      "Вера",
    ]);
  });

  it("Text formats money with formatCurrency in ru-RU", () => {
    renderMessages([
      surface("m"),
      data("m", "/amount", 15000),
      components("m", [
        {
          id: "root",
          component: "Text",
          text: { call: "formatCurrency", args: { value: { path: "/amount" }, currency: "RUB" } },
        },
      ]),
    ]);
    expect(screen.getByText("15 000,00 ₽")).toBeTruthy();
  });

  it("Heading renders its level and Button its icons", () => {
    renderMessages([
      surface("h"),
      components("h", [
        { id: "root", component: "Flex", direction: "column", children: ["title", "cta"] },
        { id: "title", component: "Heading", text: "Профиль", as: "h3" },
        {
          id: "cta",
          component: "Button",
          label: "Далее",
          rightIcon: "arrowForward",
          action: { event: { name: "next" } },
        },
      ]),
    ]);
    expect(screen.getByRole("heading", { level: 3, name: "Профиль" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Далее" }).querySelector("svg")).not.toBeNull();
  });
});
