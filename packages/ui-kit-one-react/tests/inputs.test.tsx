import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { components, data, surface } from "./support/messages.ts";
import { renderMessages } from "./support/render-messages.tsx";

describe("two-way bindings and checks [PR-01]", () => {
  failOnConsoleNoise();

  it("Input writes typed text to the data model and shows check messages after editing", async () => {
    const { dataModel } = renderMessages([
      surface("f", true),
      data("f", "/form", { email: "" }),
      components("f", [
        {
          id: "root",
          component: "Input",
          label: "Почта",
          value: { path: "/form/email" },
          helperText: "Для выписок",
          checks: [
            {
              condition: { call: "email", args: { value: { path: "/form/email" } } },
              message: "Неверный адрес",
            },
          ],
        },
      ]),
    ]);
    expect(screen.getByText("Для выписок")).toBeTruthy();
    expect(screen.queryByText("Неверный адрес")).toBeNull();
    const field = screen.getByRole("textbox", { name: "Почта" });
    await userEvent.type(field, "anna@");
    expect(dataModel("f", "/form/email")).toBe("anna@");
    expect(screen.getByText("Неверный адрес")).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(field, "bank.ru");
    expect(screen.queryByText("Неверный адрес")).toBeNull();
  });

  it("a number Input writes numbers, so numeric checks pass", async () => {
    const { dataModel } = renderMessages([
      surface("n", true),
      data("n", "/amount", ""),
      components("n", [
        { id: "root", component: "Flex", direction: "column", children: ["amount", "pay"] },
        {
          id: "amount",
          component: "Input",
          label: "Сумма",
          type: "number",
          value: { path: "/amount" },
        },
        {
          id: "pay",
          component: "Button",
          label: "Оплатить",
          action: { event: { name: "pay" } },
          checks: [
            {
              condition: { call: "numeric", args: { value: { path: "/amount" }, min: 1 } },
              message: "Сумма",
            },
          ],
        },
      ]),
    ]);
    const pay = screen.getByRole("button", { name: "Оплатить" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    await userEvent.type(screen.getByRole("spinbutton", { name: "Сумма" }), "1500");
    expect(dataModel("n", "/amount")).toBe(1500);
    expect(pay.disabled).toBe(false);
  });

  it("Checkbox writes true/false and shows its check message", async () => {
    const { dataModel } = renderMessages([
      surface("c", true),
      data("c", "/agree", true),
      components("c", [
        {
          id: "root",
          component: "Checkbox",
          label: "Согласен",
          value: { path: "/agree" },
          checks: [{ condition: { path: "/agree" }, message: "Нужно согласие" }],
        },
      ]),
    ]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Согласен" }));
    expect(dataModel("c", "/agree")).toBe(false);
    expect(screen.getByText("Нужно согласие")).toBeTruthy();
  });

  it("RadioGroup writes the chosen option value", async () => {
    const { dataModel } = renderMessages([
      surface("r", true),
      data("r", "/plan", "basic"),
      components("r", [
        {
          id: "root",
          component: "RadioGroup",
          label: "Тариф",
          value: { path: "/plan" },
          direction: "row",
          options: [
            { label: "Базовый", value: "basic" },
            { label: "Премиум", value: "premium" },
          ],
        },
      ]),
    ]);
    const group = screen.getByRole("group", { name: "Тариф" });
    await userEvent.click(within(group).getByRole("radio", { name: "Премиум" }));
    expect(dataModel("r", "/plan")).toBe("premium");
  });

  it("Switch writes its state and follows agent updates", async () => {
    const { dataModel, push } = renderMessages([
      surface("s", true),
      data("s", "/push", false),
      components("s", [
        { id: "root", component: "Switch", label: "Push-уведомления", value: { path: "/push" } },
      ]),
    ]);
    const toggle = screen.getByRole("checkbox", { name: "Push-уведомления" }) as HTMLInputElement;
    await userEvent.click(toggle);
    expect(dataModel("s", "/push")).toBe(true);
    push([data("s", "/push", false)]);
    expect(toggle.checked).toBe(false);
  });

  it("Tabs write the selected index and switch when the agent changes it", async () => {
    const { dataModel, push } = renderMessages([
      surface("t", true),
      data("t", "/ui", { tab: 0, second: "Безопасность" }),
      components("t", [
        {
          id: "root",
          component: "Tabs",
          selectedIndex: { path: "/ui/tab" },
          tabs: [
            { title: "Обзор", child: "a" },
            { title: { path: "/ui/second" }, child: "b" },
          ],
        },
        { id: "a", component: "Text", text: "Панель обзора" },
        { id: "b", component: "Text", text: "Панель безопасности" },
      ]),
    ]);
    await userEvent.click(screen.getByRole("tab", { name: "Безопасность" }));
    expect(dataModel("t", "/ui/tab")).toBe(1);
    expect(screen.getByText("Панель безопасности")).toBeTruthy();
    push([data("t", "/ui/tab", 0)]);
    expect(screen.getByRole("tab", { name: "Обзор" }).getAttribute("aria-selected")).toBe("true");
  });
});
