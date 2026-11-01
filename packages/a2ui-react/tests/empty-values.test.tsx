/**
 * A6-02 (ported from the reviewer's attack/a6/web/a6-*.test.tsx): a valid form whose checked field is
 * empty or absent in the data model (the real GLM transfer form, hand-over example 15, the login
 * few-shot without its data model) works in the package chat: the check fails (message, submit
 * disabled), no surface error, no repair turn; a filled field passes. Every hand-over example renders
 * without reporting an error.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { createA2UIChat, REPAIR_DELAY_MS } from "../src/core/index.ts";
import {
  A2UIChat,
  A2UIKitProvider,
  A2UISurface,
  useA2UIChat,
  useA2UISurfaces,
} from "../src/react/index.ts";
import { scriptedFetch } from "./support/scripted.ts";

type Message = Record<string, unknown> & {
  updateDataModel?: { value?: Record<string, unknown> };
};
const examplesDir = join(import.meta.dirname, "../../../handover/examples");
const readMessages = (path: string): Message[] =>
  (JSON.parse(readFileSync(path, "utf8")) as { messages: Message[] }).messages;
const glmReply = readMessages(join(import.meta.dirname, "support/transfer-form-reply.json"));
const example = (file: string) => readMessages(join(examplesDir, file));
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, REPAIR_DELAY_MS + 100));
  });

/** Shows `messages` as the chat's first reply; a second /prompt (a repair) would be counted. */
async function showReply(messages: readonly unknown[]) {
  const { fetch, seen } = scriptedFetch([
    { messages, text: "Готово.", turnId: "t1" },
    { text: "repair", turnId: "t2" },
  ]);
  const chat = createA2UIChat({ endpoint: "/api", fetch });
  function App() {
    const state = useA2UIChat({ chat });
    return <A2UIChat chat={state} />;
  }
  const view = render(<App />);
  await act(async () => {
    await chat.send("Форма");
  });
  await settle();
  const prompts = () => seen.filter((s) => s.path === "prompt").length;
  const type = async (input: Element, value: string) => {
    fireEvent.change(input, { target: { value } });
    await settle();
  };
  return { view, prompts, type };
}

describe("[A6-02] empty form values fail the check instead of breaking the reply", () => {
  it("[A6-02] the real GLM transfer form: empty amount fails its check, no surface error, no repair turn; filled passes", async () => {
    const { view, prompts, type } = await showReply(glmReply);
    const submit = screen.getByRole("button", { name: "Перевести" });
    const phone = view.container.querySelector('input[type="tel"]')!;
    const amount = view.container.querySelector('input[type="number"]')!;
    expect(submit).toHaveProperty("disabled", true);
    await type(phone, "+79991234567");
    expect(prompts()).toBe(1);
    expect(submit).toHaveProperty("disabled", true); // the amount is still empty
    await type(amount, "500");
    expect(submit).toHaveProperty("disabled", false);
    await type(amount, "");
    expect(submit).toHaveProperty("disabled", true);
    expect(screen.getAllByText("Укажите сумму перевода").length).toBeGreaterThan(0);
    expect(prompts()).toBe(1);
    expect(view.container.querySelectorAll("input")).toHaveLength(2);
    expect(view.container.textContent).not.toContain("Страница отклонила");
  });

  it("[A6-02] example 15 with the amount absent from the data model: typing the phone sends no repair", async () => {
    const messages = example("15-bank-transfer.json").map((m) => structuredClone(m));
    for (const m of messages) delete m.updateDataModel?.value?.["amount"];
    const { view, prompts, type } = await showReply(messages);
    await type(view.container.querySelector('input[type="tel"]')!, "+79991234567");
    expect(prompts()).toBe(1);
    expect(view.container.querySelector('input[type="number"]')).not.toBeNull();
    expect(view.container.textContent).not.toContain("Страница отклонила");
  });

  it("[A6-02] the login form without its data model: typing the e-mail sends no repair", async () => {
    const messages = example("01-login.json").filter((m) => m.updateDataModel === undefined);
    const { view, prompts, type } = await showReply(messages);
    await type(view.container.querySelector("input")!, "anna@example.ru");
    await type(view.container.querySelector("input")!, "");
    expect(prompts()).toBe(1);
    expect(view.container.querySelectorAll("input").length).toBeGreaterThan(0);
  });

  it("[A6-02] every hand-over example renders alone without reporting an error", async () => {
    function Host({ messages, onError }: { messages: unknown[]; onError: (m: string) => void }) {
      const api = useA2UISurfaces({ onError });
      useEffect(() => {
        if (api.surfaces.length === 0) api.apply(messages);
      });
      return (
        <A2UIKitProvider mode="scoped">
          {api.surfaces.map((s) => (
            <A2UISurface key={s.id} surface={s} onError={onError} />
          ))}
        </A2UIKitProvider>
      );
    }
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const files = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));
    const broken: Record<string, string> = {};
    for (const file of files) {
      const errors: string[] = [];
      const view = render(<Host messages={example(file)} onError={(m) => errors.push(m)} />);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      if (errors.length > 0) broken[file] = errors[0]!;
      view.unmount();
    }
    quiet.mockRestore();
    expect(files.length).toBeGreaterThanOrEqual(43);
    expect(broken).toEqual({});
  });
});
