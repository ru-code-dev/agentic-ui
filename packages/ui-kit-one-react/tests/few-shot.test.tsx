import checklist from "@agentic-ui/ui-kit-one-catalog/examples/compositions/24-task-checklist.json" with { type: "json" };
import transferModal from "@agentic-ui/ui-kit-one-catalog/examples/compositions/23-transfer-confirm-modal.json" with { type: "json" };
import orderStatuses from "@agentic-ui/ui-kit-one-catalog/examples/compositions/21-order-statuses.json" with { type: "json" };
import payments from "@agentic-ui/ui-kit-one-catalog/examples/compositions/22-payment-history.json" with { type: "json" };
import { screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { failOnConsoleNoise } from "./support/console-guard.ts";
import { renderMessages } from "./support/render-messages.tsx";

describe("CF few-shot compositions behave as their descriptions say", () => {
  failOnConsoleNoise();

  it("21: explicit rows show one status tag each [EX-21]", () => {
    renderMessages(orderStatuses.messages);
    for (const status of ["Доставлен", "В пути", "Отменён"])
      expect(screen.getByText(status)).toBeTruthy();
  });

  it("22: one template object repeats a row per payment with relative paths [EX-22]", () => {
    renderMessages(payments.messages);
    expect(screen.getAllByRole("button", { name: "Повторить" })).toHaveLength(8);
    expect(screen.getByText("Ozon")).toBeTruthy();
    expect(screen.getByText("08.10.2026")).toBeTruthy();
  });

  it("23: the trigger opens the modal locally; confirm is sent and closes it [EX-23]", async () => {
    const { sent } = renderMessages(transferModal.messages);
    await userEvent.click(screen.getByRole("button", { name: "Перевести" }));
    const dialog = await screen.findByRole("dialog");
    expect(sent).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(sent.map((entry) => entry.action.name)).toEqual(["transfer.confirm"]);
    expect(sent[0]?.action.context).toEqual({ transferId: "tr-7781" });
    await waitForElementToBeRemoved(dialog);
  });

  it("24: each templated checkbox writes its own item path (per-item two-way state) [EX-24]", async () => {
    const { sent, dataModel } = renderMessages(checklist.messages);
    expect(dataModel("checklist", "/tasks/1/done")).toBe(false);
    await userEvent.click(screen.getByRole("checkbox", { name: "Загрузить паспорт" }));
    expect(dataModel("checklist", "/tasks/1/done")).toBe(true);
    expect(dataModel("checklist", "/tasks/2/done")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Сохранить прогресс" }));
    expect(sent.map((entry) => entry.action.name)).toEqual(["checklist.save"]);
  });
});
