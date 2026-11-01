import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useA2UIChat, type UseA2UIChat } from "@agentic-ui/a2ui-react";
import { createA2UIChat, type A2UIChat } from "@agentic-ui/a2ui-react/core";
import { ChatHistory } from "./chat-history.tsx";
import { fakeApi, outcome } from "./test-fixtures.ts";

const original = Element.prototype.scrollIntoView;
let chat: A2UIChat;

/** The history of a real headless chat (scripted client), as the Agent page renders it. */
function History() {
  const state: UseA2UIChat = useA2UIChat({ chat });
  return <ChatHistory chat={state} />;
}

beforeEach(() => {
  chat = createA2UIChat({ client: fakeApi({ prompt: async () => outcome({ text: "Готово" }) }) });
  // Newer browsers return a Promise from scroll methods (OWN-01: the owner's crash on 867c5dc).
  Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve()) as unknown as typeof original;
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
  vi.restoreAllMocks();
});

describe("ChatHistory with a Promise-returning scrollIntoView [OWN-01]", () => {
  it("renders across updates without calling the scroll result as an effect cleanup", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await chat.send("первый");
    const view = render(<History />);
    await act(() => chat.send("второй"));
    await act(() => chat.send("третий"));
    view.unmount();
    expect(errors).not.toHaveBeenCalled();
    render(<History />);
    expect(screen.getAllByTestId("chat-turn")).toHaveLength(3);
  });
});
