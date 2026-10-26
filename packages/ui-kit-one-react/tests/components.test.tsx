import buttonExample from "@agentic-ui/ui-kit-one-catalog/examples/components/Button.json" with { type: "json" };
import modalExample from "@agentic-ui/ui-kit-one-catalog/examples/components/Modal.json" with { type: "json" };
import textExample from "@agentic-ui/ui-kit-one-catalog/examples/components/Text.json" with { type: "json" };
import { screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { renderMessages } from "./support/render-messages.tsx";

const CATALOG_ID = "urn:agentic-ui:catalog:ui-kit-one:v1";
const surface = (surfaceId: string, sendDataModel = false) => ({
  version: "v0.9",
  createSurface: { surfaceId, catalogId: CATALOG_ID, sendDataModel },
});
const components = (surfaceId: string, list: object[]) => ({
  version: "v0.9",
  updateComponents: { surfaceId, components: list },
});
const data = (surfaceId: string, path: string, value: unknown) => ({
  version: "v0.9",
  updateDataModel: { surfaceId, path, value },
});

describe("ui-kit-one renderer (Chakra UI v1)", () => {
  failOnConsoleNoise();

  it("renders the Text snippet", () => {
    renderMessages(textExample.messages);
    expect(screen.getByText("Добро пожаловать в интернет-банк").tagName).toBe("P");
  });

  it("renders a Button label bound to the data model and follows agent updates", () => {
    const { push } = renderMessages(buttonExample.messages);
    expect(screen.getByRole("button", { name: "Перевести деньги" })).toBeTruthy();
    push([data("button", "/cta", "Отправить")]);
    expect(screen.getByRole("button", { name: "Отправить" })).toBeTruthy();
  });

  it("sends the Button action with its resolved context and the data model", async () => {
    const { sent } = renderMessages(buttonExample.messages);
    await userEvent.click(screen.getByRole("button", { name: "Перевести деньги" }));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.action).toMatchObject({
      name: "transfer.start",
      surfaceId: "button",
      sourceComponentId: "root",
      context: { source: "button-snippet" },
    });
    expect(sent[0]?.dataModel).toEqual({ cta: "Перевести деньги" });
  });

  it("disables a Button while one of its checks fails", () => {
    const { push } = renderMessages([
      surface("form"),
      components("form", [
        {
          id: "root",
          component: "Button",
          label: "Продолжить",
          action: { event: { name: "form.next" } },
          checks: [
            {
              condition: { call: "required", args: { value: { path: "/name" } } },
              message: "Введите имя",
            },
          ],
        },
      ]),
    ]);
    expect((screen.getByRole("button", { name: "Продолжить" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    push([data("form", "/name", "Анна")]);
    expect((screen.getByRole("button", { name: "Продолжить" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("opens the Modal from its trigger, traps focus and closes on Escape", async () => {
    renderMessages(modalExample.messages);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Показать детали" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Перевод 15 000 ₽ будет зачислен в течение минуты.");
    expect(screen.getByText("Детали перевода")).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await waitForElementToBeRemoved(dialog);
  });

  it("binds Modal open state two-way and closes it after an event action inside", async () => {
    const { push, dataModel, sent } = renderMessages([
      surface("confirm", true),
      data("confirm", "/dialog", { open: false }),
      components("confirm", [
        {
          id: "root",
          component: "Modal",
          trigger: "open",
          content: "ok",
          open: { path: "/dialog/open" },
        },
        {
          id: "open",
          component: "Button",
          label: "Удалить",
          action: { event: { name: "delete.ask" } },
        },
        {
          id: "ok",
          component: "Button",
          label: "Да, удалить",
          action: { event: { name: "item.delete" } },
        },
      ]),
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(dataModel("confirm", "/dialog/open")).toBe(true);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Да, удалить" }));
    expect(sent.map((entry) => entry.action.name)).toEqual(["delete.ask", "item.delete"]);
    expect(dataModel("confirm", "/dialog/open")).toBe(false);
    await waitForElementToBeRemoved(dialog);
    push([data("confirm", "/dialog/open", true)]);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
